package main

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

var (
	BENCHMARK_REPO     = StringEnv("BENCHMARK_REPO", "tursodatabase/turso")
	BENCHMARK_BRANCH   = StringEnv("BENCHMARK_BRANCH", "main")
	BENCHMARK_REVISION = StringEnv("BENCHMARK_REVISION", "")
	BENCHMARK_ATTEMPTS = IntEnv("BENCHMARK_ATTEMPTS", 3)
	TURSO_ORG_NAME     = StringEnv("TURSO_ORG_NAME", "sivukhin")
	TURSO_GROUP_NAME   = StringEnv("TURSO_GROUP_NAME", "turso-benchmark")
	TURSO_API_TOKEN    = StringEnv("TURSO_API_TOKEN", "")
	TURSO_AUTH_TOKEN   = StringEnv("TURSO_AUTH_TOKEN", "")
	TURSO_DB_NAME      = StringEnv("TURSO_DB_NAME", "")
	TURSO_META_NAME    = StringEnv("TURSO_META_NAME", "")
)

func CreateDatabase(name string) error {
	url := fmt.Sprintf("https://api.turso.tech/v1/organizations/%v/databases", TURSO_ORG_NAME)
	req, err := http.NewRequest("POST", url, bytes.NewReader([]byte(fmt.Sprintf(`{"name":"%v","group":"%v"}`, name, TURSO_GROUP_NAME))))
	if err != nil {
		return err
	}
	req.Header.Add("Authorization", "Bearer "+TURSO_API_TOKEN)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("unexpected status code %v: %v", resp.StatusCode, string(body))
	}
	log.Printf("created database %v", name)
	return nil
}

func StringEnv(key string, def string) string {
	value, ok := os.LookupEnv(key)
	if !ok {
		return def
	}
	return value
}

func IntEnv(key string, def int) int {
	value, ok := os.LookupEnv(key)
	if !ok {
		return def
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return def
	}
	return parsed
}

func DownloadRepo(repo, revision string, filename string) error {
	log.Printf("download repo archive %v:%v to %v", repo, revision, filename)
	_, err := os.Stat(filename)
	if !os.IsNotExist(err) {
		return err
	} else if err == nil {
		log.Printf("file %v already exists", filename)
		return nil
	}
	url := fmt.Sprintf("https://github.com/%v/archive/%v.zip", repo, revision)
	response, err := http.Get(url)
	if err != nil {
		return err
	}
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	_, err = io.Copy(file, response.Body)
	if err != nil {
		return err
	}
	return nil
}

func UnpackRepo(filename string, target string) error {
	log.Printf("unpack repo from %v to %v", filename, target)
	_, err := os.Stat(target)
	if !os.IsNotExist(err) {
		return err
	} else if err == nil {
		log.Printf("directory %v already exists", target)
		return nil
	}
	cmd := exec.Command("unzip", filename, "-d", target)
	if err := cmd.Run(); err != nil {
		return err
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		return err
	}
	err = os.Rename(path.Join(target, entries[0].Name()), entries[0].Name())
	if err != nil {
		return err
	}
	err = os.RemoveAll(target)
	if err != nil {
		return err
	}
	err = os.Rename(entries[0].Name(), target)
	if err != nil {
		return err
	}
	return nil
}

func BuildTurso(target string, profile string) error {
	log.Printf("build turso at %v for profile %v", target, profile)
	_, err := os.Stat(path.Join(target, "target", profile, "tursodb"))
	if !os.IsNotExist(err) {
		return err
	} else if err == nil {
		log.Printf("binary for profile %v already exists", profile)
		return nil
	}
	cmd := exec.Command("cargo", "build", "--profile", profile, "--package", "turso_cli")
	cmd.Dir = target
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	go func() { io.Copy(os.Stderr, stderr) }()
	go func() { io.Copy(os.Stdout, stdout) }()

	if err := cmd.Run(); err != nil {
		return err
	}

	return nil
}

func DownloadTpch(filename string) error {
	log.Printf("download TPC-h benchmark at %v", filename)
	_, err := os.Stat(filename)
	if !os.IsNotExist(err) {
		return err
	} else if err == nil {
		log.Printf("TPC-h benchmark file %v already exists", filename)
		return nil
	}
	url := "https://github.com/lovasoa/TPCH-sqlite/releases/download/v1.0/TPC-H.db"
	response, err := http.Get(url)
	if err != nil {
		return err
	}
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	_, err = io.Copy(file, response.Body)
	if err != nil {
		return err
	}
	return nil
}

type Query struct {
	Path  string
	Query string
}

func LoadQueries(target string) ([]Query, error) {
	dir := path.Join(target, "perf", "tpc-h", "queries")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	slices.SortFunc(entries, func(a, b os.DirEntry) int {
		aInt, _ := strconv.Atoi(strings.Split(a.Name(), ".")[0])
		bInt, _ := strconv.Atoi(strings.Split(b.Name(), ".")[0])
		return aInt - bInt
	})
	queries := make([]Query, 0)
	for _, entry := range entries {
		path := path.Join(dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		query := string(data)
		lines := strings.Split(query, "\n")
		if suffix, ok := strings.CutPrefix(lines[0], "-- LIMBO_SKIP: "); ok {
			log.Printf("skip query %v: %v", entry.Name(), suffix)
			continue
		}
		queries = append(queries, Query{Path: path, Query: query})
	}
	return queries, nil
}

type TpchResult struct {
	Real, User, Sys float64
}

func ClearCaches() error {
	switch runtime.GOOS {
	case "linux":
		if err := exec.Command("sync").Run(); err != nil {
			return err
		}
		if err := exec.Command("sh", "-c", "echo 3 | sudo tee /proc/sys/vm/drop_caches").Run(); err != nil {
			return err
		}
		return nil
	case "darwin":
		if err := exec.Command("sync").Run(); err != nil {
			return err
		}
		if err := exec.Command("purge").Run(); err != nil {
			return err
		}
		return nil
	}
	return fmt.Errorf("unable to clear caches for platform '%v'", runtime.GOOS)
}

func EvalTpch(tpch string, binary string, query string, args ...string) (TpchResult, error) {
	if err := ClearCaches(); err != nil {
		log.Printf("failed to clear fs caches: %v", err)
	}
	cmd := exec.Command("bash", append(append([]string{"-c", "time", "-p", binary, tpch}, args...), query)...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return TpchResult{}, err
	}
	lines := strings.Split(string(output), "\n")
	real, user, sys := 0.0, 0.0, 0.0
	for _, line := range lines {
		if value, ok := strings.CutPrefix(line, "real "); ok {
			real, _ = strconv.ParseFloat(value, 64)
		} else if value, ok := strings.CutPrefix(line, "user "); ok {
			user, _ = strconv.ParseFloat(value, 64)
		} else if value, ok := strings.CutPrefix(line, "sys "); ok {
			sys, _ = strconv.ParseFloat(value, 64)
		}
	}
	return TpchResult{Real: real, User: user, Sys: sys}, nil
}

func EvalTpchAttempts(attempts int, run func() (TpchResult, error)) ([]TpchResult, error) {
	results := make([]TpchResult, 0)
	for i := 0; i < attempts; i++ {
		result, err := run()
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

func RecordTpchProfile(tpch string, profile string, binary string, query string, args ...string) error {
	if err := ClearCaches(); err != nil {
		log.Printf("failed to clear fs caches: %v", err)
	}
	cmd := exec.Command("samply", append(append([]string{"record", "-s", "-o", profile, "--unstable-presymbolicate", "--", binary, tpch}, args...), query)...)

	if err := cmd.Run(); err != nil {
		return err
	}
	return nil
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

func InitMeta(db *sql.DB, name string) error {
	_, err := db.Exec("CREATE TABLE IF NOT EXISTS benchmarks (name TEXT PRIMARY KEY, branch TEXT, revision TEXT)")
	if err != nil {
		return err
	}
	_, err = db.Exec("INSERT INTO benchmarks VALUES (?, ?, ?)", name, BENCHMARK_BRANCH, BENCHMARK_REVISION)
	if err != nil {
		return err
	}
	return nil
}

func InitDb(db *sql.DB, info SysInfo) error {
	_, err := db.Exec("CREATE TABLE IF NOT EXISTS parameters (name TEXT PRIMARY KEY, value)")
	if err != nil {
		return err
	}
	_, err = db.Exec("INSERT INTO parameters VALUES (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?) ON CONFLICT DO NOTHING",
		"time", time.Now().Format("2006-01-02 15:04:05"),
		"arch", info.Arch,
		"hostname", info.Hostname,
		"platform", info.Platform,
		"ram", info.RAM,
		"cpu", info.CPUCount,
		"freq", info.CPUFreq,
		"benchmark_0", "turso_tpch",
	)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS turso_tpch (
        benchmark TEXT, 
        measurement TEXT, 
        iterations REAL, 
        value REAL
    )`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS turso_tpch_profiles (
        benchmark TEXT, 
        filename TEXT,
        content BLOB,
        PRIMARY KEY (benchmark, filename)
    )`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS turso_tpch_baseline (
        benchmark TEXT, 
        measurement TEXT, 
        iterations REAL, 
        value REAL
    )`)
	if err != nil {
		return err
	}
	log.Printf("database initialized")
	return nil
}

func UpdateResultsDb(db *sql.DB, table string, becnhmark string, results []TpchResult) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	for _, result := range results {
		_, err = tx.Exec(fmt.Sprintf("INSERT INTO %v VALUES (?, ?, ?, ?)", table), becnhmark, "real", 1, result.Real)
		if err != nil {
			return err
		}
		_, err = tx.Exec(fmt.Sprintf("INSERT INTO %v VALUES (?, ?, ?, ?)", table), becnhmark, "user", 1, result.User)
		if err != nil {
			return err
		}
		_, err = tx.Exec(fmt.Sprintf("INSERT INTO %v VALUES (?, ?, ?, ?)", table), becnhmark, "sys", 1, result.Sys)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func UploadProfile(db *sql.DB, table string, benchmark string, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	_, err = db.Exec(fmt.Sprintf("INSERT INTO %v VALUES (?, ?, ?)", table), benchmark, filepath.Base(path), data)
	return err
}

func main() {
	log.Printf("start benchmark")
	info := HostStat()
	log.Printf("host stat: %+v", info)
	archive := fmt.Sprintf("%v.zip", BENCHMARK_REVISION)
	revision := fmt.Sprintf("%v", BENCHMARK_REVISION)
	tpch := "TPC-H.db"
	err := DownloadRepo(BENCHMARK_REPO, BENCHMARK_REVISION, archive)
	if err != nil {
		log.Fatalf("failed to download repo: %v", err)
	}
	err = UnpackRepo(archive, revision)
	if err != nil {
		log.Fatalf("failed to unpack repo: %v", err)
	}
	err = BuildTurso(revision, "release")
	if err != nil {
		log.Fatalf("failed build turso: %v", err)
	}
	err = DownloadTpch(tpch)
	if err != nil {
		log.Fatalf("failed to download TPC-H: %v", err)
	}
	queries, err := LoadQueries(revision)
	if err != nil {
		log.Fatalf("failed to load queries: %v", err)
	}
	turso := path.Join(revision, "target", "release", "tursodb")
	sqlite := "sqlite3"

	if TURSO_DB_NAME == "" {
		runName := fmt.Sprintf("benchmark-%v-%v", BENCHMARK_REVISION, time.Now().Unix())
		err := CreateDatabase(runName)
		if err != nil {
			log.Fatalf("failed to create database: %v", err)
		}
		TURSO_DB_NAME = runName
	}

	url := fmt.Sprintf("libsql://%v-%v.turso.io?authToken=%v", TURSO_META_NAME, TURSO_ORG_NAME, TURSO_AUTH_TOKEN)
	meta, err := sql.Open("libsql", url)
	if err != nil {
		log.Fatalf("failed to open meta db %s: %s", url, err)
	}
	defer meta.Close()

	err = InitMeta(meta, TURSO_DB_NAME)
	if err != nil {
		log.Fatalf("failed to initialize meta database: %v", err)
	}
	log.Printf("initialized meta database")

	url = fmt.Sprintf("libsql://%v-%v.turso.io?authToken=%v", TURSO_DB_NAME, TURSO_ORG_NAME, TURSO_AUTH_TOKEN)
	db, err := sql.Open("libsql", url)
	if err != nil {
		log.Fatalf("failed to open db %s: %s", url, err)
	}
	defer db.Close()

	err = InitDb(db, info)
	if err != nil {
		log.Fatalf("failed to init db: %v", err)
	}

	for _, query := range queries {
		results, err := EvalTpchAttempts(BENCHMARK_ATTEMPTS, func() (TpchResult, error) {
			return EvalTpch(tpch, turso, query.Query, "--quiet", "--output-mode", "list")
		})
		if err != nil {
			log.Fatalf("failed to evaluate results for %v: %v", turso, err)
		}
		log.Printf("evaluated results: %v %v", turso, results)

		benchmark := filepath.Base(query.Path)
		err = UpdateResultsDb(db, "turso_tpch", benchmark, results)
		if err != nil {
			log.Fatalf("failed to update turso results: %v", err)
		}
		log.Printf("updated results: %v", turso)

		profile := fmt.Sprintf("%v-%v-%v", filepath.Base(turso), benchmark, time.Now().Unix())
		profileJson := fmt.Sprintf("%v.json.gz", profile)
		profileSym := fmt.Sprintf("%v.json.syms.json", profile)
		err = RecordTpchProfile(tpch, profileJson, turso, query.Query, "--quiet", "--output-mode", "list")
		if err != nil {
			log.Fatalf("failed to record profile: %v", err)
		}
		log.Printf("recorded profile: %v %v", turso, profileJson)
		err = UploadProfile(db, "turso_tpch_profiles", benchmark, profileJson)
		if err != nil {
			log.Fatalf("failed to upload profile file %v: %v", profileJson, err)
		}
		log.Printf("uploaded profile file: %v", profileJson)

		UploadProfile(db, "turso_tpch_profiles", benchmark, profileSym)
		if err != nil {
			log.Fatalf("failed to upload profile file %v: %v", profileSym, err)
		}
		log.Printf("uploaded profile file: %v", profileSym)

		results, err = EvalTpchAttempts(BENCHMARK_ATTEMPTS, func() (TpchResult, error) {
			return EvalTpch(tpch, sqlite, query.Query)
		})
		if err != nil {
			log.Fatalf("failed to evaluate results for %v: %v", sqlite, err)
		}
		log.Printf("evaluated results: %v %v", sqlite, results)

		err = UpdateResultsDb(db, "turso_tpch_baseline", benchmark, results)
		if err != nil {
			log.Fatalf("failed to update sqlite results: %v", err)
		}
		log.Printf("updated results: %v", sqlite)
	}
}
