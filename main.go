package main

import (
	"context"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

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

func main() {
	err := godotenv.Load()
	if err != nil {
		Logger.Fatalf("failed to load env vars: %v", err)
	}

	var (
		TURSO_ORG_NAME   = StringEnv("TURSO_ORG_NAME", "sivukhin")
		TURSO_GROUP_NAME = StringEnv("TURSO_GROUP_NAME", "turso-benchmark")
		TURSO_API_TOKEN  = StringEnv("TURSO_API_TOKEN", "")
		TURSO_AUTH_TOKEN = StringEnv("TURSO_AUTH_TOKEN", "")
		TURSO_META_NAME  = StringEnv("TURSO_META_NAME", "")
		RUNNER_ID        = StringEnv("RUNNER_ID", "")
		RUNNER_DIR       = StringEnv("RUNNER_DIR", ".runner")
	)

	system := System{
		storage: Storage{
			OrgName:   TURSO_ORG_NAME,
			GroupName: TURSO_GROUP_NAME,
			ApiToken:  TURSO_API_TOKEN,
			AuthToken: TURSO_AUTH_TOKEN,
		},
		id:   RUNNER_ID,
		meta: TURSO_META_NAME,
		path: RUNNER_DIR,
		runners: []Runner{
			&RunnerSqlite{},
			&RunnerTurso{Profile: "release", Path: RUNNER_DIR},
		},
		datatsets: []Dataset{
			&DatasetClickhouse{Rows: 1000000},
			&DatasetTpch{},
		},
		benchmark: Benchmark{
			Warmup:      2,
			Attempts:    5,
			ClearCaches: true,
		},
		errorDelay: 5 * time.Second,
		sleepDelay: 1 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()

	err = system.Run(ctx)
	if err != nil {
		Logger.Fatalf("benchmark failed: %v", err)
	}
}
