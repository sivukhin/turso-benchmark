package main

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

type Storage struct {
	OrgName   string
	GroupName string
	ApiToken  string
	AuthToken string
}

type BenchmarkResult struct {
	Runner    string
	Dataset   string
	Name      string
	TotalTime float64
	Attempts  int
}

type BenchmarkProfile struct {
	Runner  string
	Dataset string
	Name    string
	Files   []string
}

type BenchmarkInfo struct {
	Repo     string
	Branch   string
	Revision string
	Dataset  string
	Results  string
	Profiles string
}

func (s *Storage) CreateDatabase(name string) error {
	url := fmt.Sprintf("https://api.turso.tech/v1/organizations/%v/databases", s.OrgName)
	req, err := http.NewRequest("POST", url, bytes.NewReader([]byte(fmt.Sprintf(`{"name":"%v","group":"%v"}`, name, s.GroupName))))
	if err != nil {
		return err
	}
	req.Header.Add("Authorization", "Bearer "+s.ApiToken)

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
	Logger.Infof("created database %v", name)
	return nil
}

func (s *Storage) ConnectDb(name string) (*sql.DB, error) {
	url := fmt.Sprintf("libsql://%v-%v.turso.io?authToken=%v", name, s.OrgName, s.AuthToken)
	return sql.Open("libsql", url)
}

func (s *Storage) DbLink(name string) string {
	return fmt.Sprintf("%v-%v.turso.io", name, s.OrgName)
}

func (s *Storage) InitBenchmarkMeta(meta *sql.DB) error {
	_, err := meta.Exec(`CREATE TABLE IF NOT EXISTS benchmarks (
		repo TEXT, 
		branch TEXT, 
		revision TEXT, 
		dataset TEXT,
		results TEXT,
		profiles TEXT,
		finished BOOL,
		PRIMARY KEY (repo, branch, revision, dataset)
	)`)
	if err != nil {
		return err
	}
	return nil
}

func (s *Storage) AddBenchmarkDb(meta *sql.DB, benchmark BenchmarkInfo) error {
	_, err := meta.Exec("INSERT INTO benchmarks VALUES (?, ?, ?, ?, NULL, NULL)", benchmark.Repo, benchmark.Branch, benchmark.Revision, benchmark.Dataset)
	if err != nil {
		return err
	}
	return nil
}

func (s *Storage) FetchBenchmarksToRun(meta *sql.DB) ([]BenchmarkInfo, error) {
	rows, err := meta.Query("SELECT repo, branch, revision, dataset, results, profiles FROM benchmarks WHERE finished != 1")
	if err != nil {
		return nil, err
	}
	benchmarks := make([]BenchmarkInfo, 0)
	var benchmark BenchmarkInfo
	for rows.Next() {
		err = rows.Scan(&benchmark.Repo, &benchmark.Branch, &benchmark.Revision, &benchmark.Dataset, &benchmark.Results, &benchmark.Profiles)
		if err != nil {
			return nil, err
		}
		benchmarks = append(benchmarks, benchmark)
	}
	return benchmarks, nil
}

func (s *Storage) LinkBenchmarkDb(meta *sql.DB, benchmark BenchmarkInfo, results string, profiles string) error {
	_, err := meta.Exec(
		`UPDATE benchmarks SET results = ?, profiles = ? WHERE repo = ? AND branch = ? AND revision = ? AND dataset = ?`,
		results,
		profiles,
		benchmark.Repo,
		benchmark.Branch,
		benchmark.Revision,
		benchmark.Dataset,
	)
	if err != nil {
		return err
	}
	return nil
}

func (s *Storage) FinishBenchmark(meta *sql.DB, benchmark BenchmarkInfo) error {
	_, err := meta.Exec(
		`UPDATE benchmarks SET finished = 1 WHERE repo = ? AND branch = ? AND revision = ? AND dataset = ?`,
		benchmark.Repo,
		benchmark.Branch,
		benchmark.Revision,
		benchmark.Dataset,
	)
	if err != nil {
		return err
	}
	return nil
}

func (s *Storage) Parameters(db *sql.DB) (map[string]string, error) {
	rows, err := db.Query("SELECT name, value FROM parameters")
	if err != nil {
		return nil, err
	}
	results := make(map[string]string, 0)
	for rows.Next() {
		var name, value string
		rows.Scan(&name, &value)
		results[name] = value
	}
	return results, nil
}

func (s *Storage) WrittenQueries(db *sql.DB, benchmark BenchmarkInfo, dataset string) (map[string]bool, error) {
	rows, err := db.Query("SELECT name FROM measurements WHERE dataset = ?", dataset)
	if err != nil {
		return nil, err
	}
	results := make(map[string]bool, 0)
	for rows.Next() {
		var name string
		rows.Scan(&name)
		results[name] = true
	}
	return results, nil
}

func (s *Storage) InitResultsDb(db *sql.DB, meta map[string]any) error {
	_, err := db.Exec("CREATE TABLE IF NOT EXISTS parameters (name TEXT PRIMARY KEY, value)")
	if err != nil {
		return err
	}
	parameters := make([]any, 0)
	parameters = append(parameters, "time", time.Now().Format("2006-01-02 15:04:05"))
	for key, value := range meta {
		parameters = append(parameters, key, fmt.Sprintf("%v", value))
	}
	placeholders := strings.Join(slices.Repeat([]string{"(?, ?)"}, len(parameters)/2), ", ")
	_, err = db.Exec(
		fmt.Sprintf("INSERT INTO parameters VALUES %v ON CONFLICT DO NOTHING", placeholders),
		parameters...,
	)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS measurements (
		runner TEXT,
		dataset TEXT,
		name TEXT,
        measurement TEXT, 
        iterations REAL, 
        value REAL,
		PRIMARY KEY (runner, dataset, name, measurement)
    )`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS profiles (
        runner TEXT,
		dataset TEXT,
		name TEXT,
		filename TEXT,
        content BLOB,
        PRIMARY KEY (runner, dataset, name, filename)
    )`)
	if err != nil {
		return err
	}
	Logger.Infof("initialized database for benchmark results with meta %v", meta)
	return nil
}

func (s *Storage) InitProfilesDb(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS profiles (
        runner TEXT,
		dataset TEXT,
		name TEXT,
		filename TEXT,
        content BLOB,
        PRIMARY KEY (runner, dataset, name, filename)
    )`)
	if err != nil {
		return err
	}
	Logger.Infof("initialized database for benchmark profiles with meta")
	return nil
}

func (s *Storage) UpdateBenchmarkDb(db *sql.DB, results []BenchmarkResult) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	for _, result := range results {
		_, err = tx.Exec(
			"INSERT INTO measurements VALUES (?, ?, ?, ?, ?, ?)",
			result.Runner,
			result.Dataset,
			result.Name,
			"total_time",
			result.Attempts,
			result.TotalTime,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Storage) UploadProfileDb(db *sql.DB, profile BenchmarkProfile) error {
	for _, file := range profile.Files {
		data, err := os.ReadFile(file)
		if err != nil {
			return err
		}
		_, err = db.Exec("INSERT INTO profiles VALUES (?, ?, ?, ?, ?)", profile.Runner, profile.Dataset, profile.Name, filepath.Base(file), data)
		if err != nil {
			return err
		}
	}
	return nil
}
