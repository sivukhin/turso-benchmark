package main

import (
	_ "embed"
	"fmt"
	"os"
)

//go:embed dataset_vectors_dense_query.sql
var queryDense string

var queriesVectorsDense = []Query{
	{Name: "0", Query: queryDense},
}

type DatasetVectorsDense struct{}

func (d *DatasetVectorsDense) Name() string { return "vectors-dense" }
func (d *DatasetVectorsDense) Load(path string) ([]Query, error) {
	if _, err := os.Stat(path); err == nil {
		Logger.Infof("dataset %v already exists, skip initialization", d.Name())
		return queriesVectorsDense, nil
	}
	return nil, fmt.Errorf("dataset must be initialized in advance")
}
