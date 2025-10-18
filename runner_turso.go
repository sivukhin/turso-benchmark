package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path"
)

type RunnerTurso struct {
	Path    string
	Profile string
}

type InstanceTurso struct {
	Path     string
	Repo     string
	Profile  string
	Revision string
}

func (r *InstanceTurso) archive() string {
	return path.Join(r.Path, fmt.Sprintf("benchmark-turso-%v.zip", r.Revision))
}
func (r *InstanceTurso) dir() string {
	return path.Join(r.Path, fmt.Sprintf("benchmark-turso-%v", r.Revision))
}
func (r *InstanceTurso) bin() string {
	return path.Join(r.dir(), "target", r.Profile, "tursodb")
}

func (r *RunnerTurso) Name() string { return "turso" }
func (r *RunnerTurso) Init(benchmark BenchmarkInfo) (Instance, error) {
	instance := &InstanceTurso{
		Path:     r.Path,
		Repo:     benchmark.Repo,
		Profile:  r.Profile,
		Revision: benchmark.Revision,
	}
	err := DownloadRepo(benchmark.Repo, instance.Revision, instance.archive())
	if err != nil {
		return nil, err
	}
	err = UnpackRepo(instance.archive(), instance.dir())
	if err != nil {
		return nil, err
	}
	err = BuildTurso(instance.dir(), r.Profile)
	if err != nil {
		return nil, err
	}

	return instance, nil
}

func (r *InstanceTurso) Name() string { return "turso" }
func (r *InstanceTurso) RunCmd(path string, query string) []string {
	return []string{r.bin(), "--quiet", "--output-mode", "list", path, query}
}

func DownloadRepo(repo, revision string, filename string) error {
	Logger.Infof("download repo archive %v:%v to %v", repo, revision, filename)
	_, err := os.Stat(filename)
	if !os.IsNotExist(err) {
		return err
	} else if err == nil {
		Logger.Infof("file %v already exists", filename)
		return nil
	}
	url := fmt.Sprintf("https://github.com/%v/archive/%v.zip", repo, revision)
	response, err := http.Get(url)
	if err != nil {
		return err
	}
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Sync()

	_, err = io.Copy(file, response.Body)
	if err != nil {
		return err
	}
	return nil
}

func UnpackRepo(filename string, target string) error {
	Logger.Infof("unpack repo from %v to %v", filename, target)
	_, err := os.Stat(target)
	if !os.IsNotExist(err) {
		return err
	} else if err == nil {
		Logger.Infof("directory %v already exists", target)
		return nil
	}
	cmd := exec.Command("unzip", filename, "-d", target)
	if err := cmd.Run(); err != nil {
		return err
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		return err
	}
	Logger.Infof("entries: %v", entries)
	err = os.Rename(path.Join(target, entries[0].Name()), entries[0].Name())
	if err != nil {
		return err
	}
	err = os.RemoveAll(target)
	if err != nil {
		return err
	}
	err = os.Rename(entries[0].Name(), target)
	if err != nil {
		return err
	}
	return nil
}

func BuildTurso(target string, profile string) error {
	Logger.Infof("build turso at %v for profile %v", target, profile)
	_, err := os.Stat(path.Join(target, "target", profile, "tursodb"))
	if !os.IsNotExist(err) {
		return err
	} else if err == nil {
		Logger.Infof("binary for profile %v already exists", profile)
		return nil
	}
	cmd := exec.Command("cargo", "build", "--profile", profile, "--package", "turso_cli")
	cmd.Dir = target
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	go func() { io.Copy(os.Stderr, stderr) }()
	go func() { io.Copy(os.Stdout, stdout) }()

	if err := cmd.Run(); err != nil {
		return err
	}

	return nil
}
