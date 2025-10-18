package main

import (
	"fmt"
	"log"
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	Logger      *zap.SugaredLogger
	AtomicLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
)

func init() {
	logLevel, ok := os.LookupEnv("LOG_LEVEL")
	if !ok {
		logLevel = "INFO"
	}
	atomicLevel, err := zap.ParseAtomicLevel(logLevel)
	if err == nil {
		AtomicLevel.SetLevel(atomicLevel.Level())
	} else {
		log.Printf("failed to parse log level, fallback to INFO: %v", err)
	}
	config := zap.Config{
		Level:       AtomicLevel,
		Development: false,
		Sampling: &zap.SamplingConfig{
			Initial:    100,
			Thereafter: 100,
		},
		Encoding: "console",
		EncoderConfig: zapcore.EncoderConfig{
			MessageKey:     "M",
			LevelKey:       "L",
			TimeKey:        "T",
			NameKey:        "N",
			CallerKey:      zapcore.OmitKey,
			FunctionKey:    zapcore.OmitKey,
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.CapitalLevelEncoder,
			EncodeTime:     zapcore.ISO8601TimeEncoder,
			EncodeDuration: zapcore.StringDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
		OutputPaths:      []string{"stderr"},
		ErrorOutputPaths: []string{"stderr"},
	}

	logger, err := config.Build()
	if err != nil {
		panic(fmt.Errorf("failed to initialize logger: %w", err))
	}
	Logger = logger.Sugar()
}
