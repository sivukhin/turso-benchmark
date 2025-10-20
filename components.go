package main

type Query struct {
	Name           string
	Query          string
	Runners        []string
	MatchOnlyCount bool
}

type Dataset interface {
	Name() string
	Load(path string) ([]Query, error)
}

type Runner interface {
	Name() string
	Init(info BenchmarkInfo) (Instance, error)
}

type Instance interface {
	Name() string
	RunCmd(path string, query string) []string
}
