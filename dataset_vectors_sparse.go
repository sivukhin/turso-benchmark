package main

import (
	_ "embed"
	"fmt"
	"os"
)

//go:embed dataset_vectors_sparse_query.sql
var querySparse string

var queriesVectorsSparse = []Query{
	{Name: "0", Query: querySparse},
}

type DatasetVectorsSparse struct{}

func (d *DatasetVectorsSparse) Name() string { return "vectors-dense" }
func (d *DatasetVectorsSparse) Load(path string) ([]Query, error) {
	if _, err := os.Stat(path); err == nil {
		Logger.Infof("dataset %v already exists, skip initialization", d.Name())
		return queriesVectorsSparse, nil
	}
	return nil, fmt.Errorf("dataset must be initialized in advance")
}
