// The actual runner implementation is in the /loadrunner directory. This
// package just implements an interface to the runner. It allows the controller
// to start and stop runner instances.

package runner

import (
	"encoding/json"
	"os"
	"os/exec"

	"github.com/DerGut/load-tests/accounts"
)

const ClassesPerRunner = 10

type Client interface {
	Start(url string, accounts []accounts.Classroom) error
	Stop() error
}

func NewLocal() Client {
	return &LocalClient{}
}

const (
	runnerFile = "loadrunner/built/main.js"
)

type LocalClient struct {
	proc *os.Process
}

func (lr *LocalClient) Start(url string, a []accounts.Classroom) error {
	accountsJson, err := json.Marshal(a)
	if err != nil {
		return err
	}

	cmd := exec.Command(
		"node",
		runnerFile,
		url,
		string(accountsJson),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return err
	}

	lr.proc = cmd.Process
	return nil
}

func (lr *LocalClient) Stop() error {
	return lr.proc.Signal(os.Interrupt)
}
