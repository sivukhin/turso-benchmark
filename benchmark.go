package main

import (
	"fmt"
	"math/rand"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type Benchmark struct {
	Warmup      int
	Attempts    int
	ClearCaches bool
}

func clearCaches() error {
	switch runtime.GOOS {
	case "linux":
		if err := exec.Command("sync").Run(); err != nil {
			return err
		}
		if err := exec.Command("sudo", "sh", "-c", "echo 3 > /proc/sys/vm/drop_caches").Run(); err != nil {
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

func (b *Benchmark) clearCachesIfNeeded() error {
	if !b.ClearCaches {
		return nil
	}
	Logger.Info("clear caches")
	return clearCaches()
}

func (b *Benchmark) runCmd(args []string) ([]string, error) {
	cmd := exec.Command(args[0], args[1:]...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("err=%w, out=%v", err, string(output))
	}
	lines := strings.Split(string(output), "\n")
	return lines, nil
}

func (b *Benchmark) WarmupCmd(args []string) error {
	for i := 0; i < b.Warmup; i++ {
		Logger.Infof("running warmup #%v/%v cmd %v", i+1, b.Warmup, args[:len(args)-1])
		_, err := b.runCmd(args)
		if err != nil {
			return fmt.Errorf("warmup #%v failed: %w", i, err)
		}
	}
	return nil
}

func (b *Benchmark) RunCmd(args []string) (BenchmarkResult, []string, error) {
	var totalTime time.Duration
	var lines []string
	for i := 0; i < b.Attempts; i++ {
		err := b.clearCachesIfNeeded()
		if err != nil {
			return BenchmarkResult{}, nil, err
		}

		Logger.Infof("running workload #%v/%v cmd %v", i+1, b.Attempts, args[:len(args)-1])

		start := time.Now()
		lines, err = b.runCmd(args)
		totalTime = totalTime + time.Since(start)

		if err != nil {
			return BenchmarkResult{}, nil, fmt.Errorf("run #%v failed: %w", i, err)
		}
	}
	result := BenchmarkResult{
		TotalTime: totalTime.Seconds(),
		Attempts:  b.Attempts,
	}
	return result, lines, nil
}

func (b *Benchmark) ProfileCmd(args []string) ([]string, error) {
	prefix := fmt.Sprintf("profile-%v-%v", time.Now().Unix(), rand.Intn(1000))
	profileJson := fmt.Sprintf("%v.json.gz", prefix)
	profileSym := fmt.Sprintf("%v.json.syms.json", prefix)

	final := make([]string, 0)
	final = append(final, "samply", "record", "-s", "-o", profileJson, "--unstable-presymbolicate", "--")
	final = append(final, args...)

	err := b.clearCachesIfNeeded()
	if err != nil {
		return nil, err
	}

	Logger.Infof("running profile cmd %v", final[:len(final)-1])
	cmd := exec.Command(final[0], final[1:]...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("profile command failed: err=%w, out=%v", err, string(output))
	}

	return []string{profileJson, profileSym}, nil
}
