// The actual runner implementation is in the /loadrunner directory. This
// package just implements an interface to the runner. It allows the controller
// to start and stop runner instances.

package runner

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/controller/provisioner"
)

const ClassesPerRunner = 10

type Client interface {
	Start(runID, url string, accounts []accounts.Classroom) error
	Stop() error
}

func NewRemote(apiToken, runID, region, size string) Client {
	do := provisioner.NewDO(apiToken, runID, region, size)
	return &RemoteClient{
		provisioner: do,
	}
}

const (
	agentImage  = "datadog/dogstatsd:latest"
	runnerImage = "jsteinmann/load-test:latest"
)

type RemoteClient struct {
	provisioner provisioner.Provisioner
	instance    provisioner.Instance
}

func (rr *RemoteClient) Start(runID, url string, a []accounts.Classroom) error {
	inst, err := rr.provisioner.Provision()
	if err != nil {
		return fmt.Errorf("failed to provision instance: %w", err)
	}

	cmd := BuildDockerRunCmd(agentImage, map[string]string{
		"ipc": "host",
	}, map[string]string{}, map[string]string{})
	if err = inst.StartProcess(cmd); err != nil {
		return fmt.Errorf("failed to start statsD agent on host %s: %w", inst, err)
	}

	cmd = BuildDockerRunCmd(runnerImage, map[string]string{}, map[string]string{}, map[string]string{})
	if err = inst.StartProcess(cmd); err != nil {
		return fmt.Errorf("failed to start runner on host %s: %w", inst, err)
	}

	rr.instance = inst
	return nil
}

func BuildDockerRunCmd(image string, dockerArgs, env, cmdArgs map[string]string) string {
	sb := strings.Builder{}
	sb.WriteString("docker run")
	for k, v := range dockerArgs {
		sb.WriteString(fmt.Sprintf(" --%s=%s", k, v))
	}
	for k, v := range env {
		sb.WriteString(fmt.Sprintf(" --env %s=%s", k, v))
	}

	sb.WriteString(" " + image)

	for k, v := range cmdArgs {
		sb.WriteString(fmt.Sprintf(" --%s=%s", k, v))
	}

	return sb.String()
}

func (rr *RemoteClient) Stop() error {
	return rr.instance.Destroy() // TODO: stop processes or just don't bother?
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

func (lr *LocalClient) Start(runID, url string, a []accounts.Classroom) error {
	accountsJson, err := json.Marshal(a)
	if err != nil {
		return err
	}

	cmd := exec.Command(
		"node",
		runnerFile,
		runID,
		url,
		string(accountsJson),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	debug := true
	if debug {
		cmd.Env = []string{"PWDEBUG=1"}
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	lr.proc = cmd.Process
	return nil
}

func (lr *LocalClient) Stop() error {
	return lr.proc.Signal(os.Interrupt)
}
