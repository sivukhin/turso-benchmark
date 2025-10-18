package main

import "testing"

func TestTursoRunner(t *testing.T) {
	turso := RunnerTurso{Profile: "release"}
	t.Log(turso.Init(BenchmarkInfo{Repo: "tursodatabase/turso", Revision: "main"}))
}
