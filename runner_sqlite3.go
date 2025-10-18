package main

type RunnerSqlite struct{}

func (r *RunnerSqlite) Name() string                           { return "sqlite3" }
func (r *RunnerSqlite) Init(_ BenchmarkInfo) (Instance, error) { return &RunnerSqlite{}, nil }
func (r *RunnerSqlite) RunCmd(path string, query string) []string {
	return []string{"sqlite3", path, query}
}
