package main

import (
	"os"
	"os/exec"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClickhouse(t *testing.T) {
	db, err := os.CreateTemp("", "test-clickhouse")
	require.Nil(t, err)
	defer os.Remove(db.Name())

	dataset := DatasetClickhouse{Rows: 1000}
	_, err = dataset.Load(db.Name())
	require.Nil(t, err)

	cmd := exec.Command("sqlite3", db.Name(), "select count(*) from hits")
	output, err := cmd.Output()
	require.Nil(t, err)
	require.Equal(t, "1000\n", string(output))
}
