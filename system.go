package main

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"path"
	"runtime"
	"slices"
	"time"

	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/host"
	"github.com/shirou/gopsutil/mem"
)

const Version = "v1"

type System struct {
	storage     Storage
	runners     []Runner
	datatsets   []Dataset
	benchmark   Benchmark
	initialized map[string]Loaded
	id          string
	meta        string
	path        string
	sleepDelay  time.Duration
	errorDelay  time.Duration
}

type Loaded struct {
	Path    string
	Queries []Query
}

type SysInfo struct {
	Arch     string
	Hostname string
	Platform string
	CPUCount int
	CPUFreq  float64
	RAM      float64
}

func HostStat() SysInfo {
	hostStat, _ := host.Info()
	cpuStat, _ := cpu.Info()
	vmStat, _ := mem.VirtualMemory()
	totalFreq := 0.0
	for _, cpu := range cpuStat {
		totalFreq += cpu.Mhz
	}
	info := SysInfo{
		Arch:     runtime.GOARCH,
		Hostname: hostStat.Hostname,
		Platform: hostStat.Platform,
		CPUCount: len(cpuStat),
		CPUFreq:  totalFreq / float64(len(cpuStat)) * 1000,
		RAM:      float64(vmStat.Total) / 1024 / 1024 / 1024,
	}
	return info
}

func (s *System) Run(ctx context.Context) error {
	Logger.Infof("start benchmark")

	info := HostStat()
	Logger.Infof("host stat: %+v", info)

	meta, err := s.storage.ConnectDb(s.meta)
	if err != nil {
		return err
	}

	err = s.storage.InitBenchmarkMeta(meta)
	if err != nil {
		return err
	}

	if s.initialized == nil {
		s.initialized = make(map[string]Loaded, 0)
	}

	for _, dataset := range s.datatsets {
		if _, ok := s.initialized[dataset.Name()]; !ok {
			datasetPath := path.Join(s.path, fmt.Sprintf("dataset-%v.db", dataset.Name()))
			Logger.Infof("started dataset %v initialization at %v", dataset.Name(), datasetPath)
			queries, err := dataset.Load(datasetPath)
			Logger.Infof("finished dataset %v initialization at %v", dataset.Name(), datasetPath)

			if err != nil {
				return fmt.Errorf("failed to initialize dataset %v: %w", dataset.Name(), err)
			}
			s.initialized[dataset.Name()] = Loaded{Path: datasetPath, Queries: queries}
		}
	}

	for ctx.Err() == nil {
		benchmarks, err := s.storage.FetchBenchmarksToRun(meta)
		if err != nil {
			Logger.Errorf("failed to load benchmarks to run: %v", err)
		} else {
			Logger.Infof("loaded %v benchmarks to run", len(benchmarks))
		}
		for _, benchmark := range benchmarks {
			err = s.RunBechmark(meta, info, benchmark)
			if err != nil {
				Logger.Errorf("failed to execute benchmark %v: %v", benchmark, err)
				break
			}
		}
		if err != nil {
			select {
			case <-time.NewTimer(s.errorDelay).C:
			case <-ctx.Done():
			}
		} else if len(benchmarks) == 0 {
			select {
			case <-time.NewTimer(s.sleepDelay).C:
			case <-ctx.Done():
			}
		}
	}

	return nil
}

func (s *System) RunBechmark(meta *sql.DB, info SysInfo, benchmark BenchmarkInfo) error {
	Logger.Infof("running benchmark %v", benchmark)

	var err error
	var resultsDb, profilesDb *sql.DB
	resultsName, profilesName := benchmark.Results, benchmark.Profiles

	if resultsName == "" && profilesName == "" {
		revisionShort := benchmark.Revision[0:min(8, len(benchmark.Revision))]
		now, nonce := time.Now(), rand.Intn(1000)
		resultsName = fmt.Sprintf("benchmark-%v-%v-%v-%v", Version, revisionShort, now.Unix(), nonce)
		profilesName = fmt.Sprintf("profiles-%v-%v-%v-%v", Version, revisionShort, now.Unix(), nonce)
		err := s.storage.CreateDatabase(resultsName)
		if err != nil {
			return fmt.Errorf("unable to create results benchmark db %v: %w", resultsName, err)
		}
		err = s.storage.CreateDatabase(profilesName)
		if err != nil {
			return fmt.Errorf("unable to create profiles benchmark db %v: %w", resultsName, err)
		}

		resultsDb, err = s.storage.ConnectDb(resultsName)
		if err != nil {
			return fmt.Errorf("unable to connect to the results benchmark db %v: %w", resultsName, err)
		}
		profilesDb, err = s.storage.ConnectDb(profilesName)
		if err != nil {
			return fmt.Errorf("unable to connect to the profiles benchmark db %v: %w", profilesName, err)
		}
		err = s.storage.InitResultsDb(resultsDb, map[string]any{
			"runner":   s.id,
			"repo":     benchmark.Repo,
			"branch":   benchmark.Branch,
			"revision": benchmark.Revision,
			"arch":     info.Arch,
			"hostname": info.Hostname,
			"platform": info.Platform,
			"ram":      info.RAM,
			"cpu":      info.CPUCount,
			"freq":     info.CPUFreq,
		})
		if err != nil {
			return fmt.Errorf("unable to initialize benchmark results db %v: %w", resultsName, err)
		}
		err = s.storage.InitProfilesDb(profilesDb)
		if err != nil {
			return fmt.Errorf("unable to initialize benchmark profiles db %v: %w", resultsName, err)
		}
		err = s.storage.LinkBenchmarkDb(meta, benchmark, resultsName, profilesName)
		if err != nil {
			return fmt.Errorf("failed to link db %v: %w", benchmark, err)
		}
	} else {
		resultsDb, err = s.storage.ConnectDb(resultsName)
		if err != nil {
			return fmt.Errorf("unable to connect to the results benchmark db %v: %w", resultsName, err)
		}

		parameters, err := s.storage.Parameters(resultsDb)
		if err != nil {
			return fmt.Errorf("unable to fetch parameters from results benchmark db %v: %w", resultsName, err)
		}

		if parameters["runner"] != s.id {
			return fmt.Errorf("another runner already started evaluation of the benchmark %v", resultsName)
		}

		profilesDb, err = s.storage.ConnectDb(profilesName)
		if err != nil {
			return fmt.Errorf("unable to connect to the profiles benchmark db %v: %w", profilesName, err)
		}
	}

	var target Dataset
	for _, dataset := range s.datatsets {
		if dataset.Name() == benchmark.Dataset {
			target = dataset
		}
	}
	if target == nil {
		return fmt.Errorf("unknown dataset: %v", benchmark.Dataset)
	}

	loaded := s.initialized[target.Name()]

	runners := make([]Instance, 0)
	for _, factory := range s.runners {
		runner, err := factory.Init(benchmark)
		if err != nil {
			return fmt.Errorf("failed to initialize runner %v for %v: %w", factory.Name(), benchmark, err)
		}
		runners = append(runners, runner)
	}

	written, err := s.storage.WrittenQueries(resultsDb, benchmark, benchmark.Dataset)
	if err != nil {
		return fmt.Errorf("failed to fetch written queries for %v: %w", benchmark, err)
	}
	for _, query := range loaded.Queries {
		if written[query.Name] {
			continue
		}
		results, profiles, err := s.ExecuteBenchmark(benchmark, loaded.Path, query, runners)
		if err != nil {
			return fmt.Errorf("failed to execute benchmark %v: %w", benchmark, err)
		}

		err = s.storage.UpdateBenchmarkDb(resultsDb, results)
		if err != nil {
			return fmt.Errorf("failed to update benchmark results %v: %w", benchmark, err)
		}
		for _, profile := range profiles {
			err = s.storage.UploadProfileDb(profilesDb, profile)
			if err != nil {
				return fmt.Errorf("failed to upload profile results %v: %w", benchmark, err)
			}
		}
	}

	err = s.storage.FinishBenchmark(meta, benchmark)
	if err != nil {
		return fmt.Errorf("failed to finish benchmark %v: %w", benchmark, err)
	}

	return nil
}

func (s *System) ExecuteBenchmark(
	benchmark BenchmarkInfo,
	path string,
	query Query,
	runners []Instance,
) ([]BenchmarkResult, []BenchmarkProfile, error) {
	results := make([]BenchmarkResult, 0)
	profiles := make([]BenchmarkProfile, 0)
	type linesInfo struct {
		runner string
		lines  []string
	}
	runnerLines := make([]linesInfo, 0)
	for _, runner := range runners {
		Logger.Infof("running query %v/%v with runner %v", benchmark.Dataset, query.Name, runner.Name())
		cmd := runner.RunCmd(path, query.Query)
		err := s.benchmark.WarmupCmd(cmd)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to warmup benchmark in runner %v for query %v: %w", runner.Name(), query.Name, err)
		}
		local, lines, err := s.benchmark.RunCmd(cmd)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to run benchmark in runner %v for query %v: %w", runner.Name(), query.Name, err)
		}
		files, err := s.benchmark.ProfileCmd(cmd)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to run profile in runner %v for query %v: %w", runner.Name(), query.Name, err)
		}
		runnerLines = append(runnerLines, linesInfo{runner: runner.Name(), lines: lines})
		for _, result := range local {
			results = append(results, BenchmarkResult{
				Runner:    runner.Name(),
				Dataset:   benchmark.Dataset,
				Name:      query.Name,
				TotalTime: result.TotalTime,
				Attempts:  result.Attempts,
			})
		}

		profiles = append(profiles, BenchmarkProfile{
			Runner:  runner.Name(),
			Dataset: benchmark.Dataset,
			Name:    query.Name,
			Files:   files,
		})
	}
	for i := 1; i < len(runnerLines); i++ {
		if !query.IgnoreOutput && slices.Equal(runnerLines[0].lines, runnerLines[i].lines) {
			continue
		}
		if query.IgnoreOutput && len(runnerLines[0].lines) == len(runnerLines[i].lines) {
			continue
		}
		err := fmt.Errorf(
			"results are different for runners %v and %v: %+v != %+v",
			runnerLines[0].runner,
			runnerLines[i].runner,
			runnerLines[0].lines,
			runnerLines[i].lines,
		)
		return nil, nil, err
	}
	return results, profiles, nil
}
