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

const (
	// ClassesPerRunner is the number of classes a single runner can manage simultaneously
	ClassesPerRunner = 10

	agentImage  = "datadog/dogstatsd:latest"
	runnerImage = "jsteinmann/load-test:latest"
)

type Client interface {
	Start(runID, url string, accounts []accounts.Classroom) error
	Stop() error
}

func NewRemote(doApiToken, ddApiKey, region, size string) Client {
	do := provisioner.NewDO(doApiToken, region, size)
	return &RemoteClient{
		provisioner: do,
		ddApiKey:    ddApiKey,
	}
}

type RemoteClient struct {
	provisioner provisioner.Provisioner
	instance    provisioner.Instance
	ddApiKey    string
}

func (rc *RemoteClient) Start(runID, url string, a []accounts.Classroom) error {
	accountsJson, err := json.Marshal(a)
	if err != nil {
		return err
	}

	inst, err := rc.provisioner.Provision(runID)
	if err != nil {
		return fmt.Errorf("failed to provision instance: %w", err)
	}

	cmd := BuildDockerRunCmd(
		agentImage,
		[]string{},
		[]string{"DD_API_KEY=" + rc.ddApiKey},
		[]string{},
	)
	if err = inst.StartProcess(cmd); err != nil {
		return fmt.Errorf("failed to start statsD agent on host %s: %w", inst, err)
	}

	cmd = BuildDockerRunCmd(
		runnerImage,
		[]string{"--ipc=host"},
		[]string{
			"RUN_ID=" + runID,
			"URL=" + url,
			"ACCOUNTS=" + string(accountsJson),
		},
		[]string{},
	)
	if err = inst.StartProcess(cmd); err != nil {
		return fmt.Errorf("failed to start runner on host %s: %w", inst, err)
	}

	rc.instance = inst
	return nil
}

func BuildDockerRunCmd(image string, dockerArgs, env, cmdArgs []string) string {
	sb := strings.Builder{}
	sb.WriteString("docker run ")
	sb.WriteString(strings.Join(dockerArgs, " "))
	for _, v := range env {
		sb.WriteString(fmt.Sprintf(" --env %s", v))
	}
	sb.WriteString(" " + image + " ")
	sb.WriteString(strings.Join(cmdArgs, " "))

	return sb.String()
}

func (rc *RemoteClient) Stop() error {
	return rc.instance.Destroy() // TODO: stop processes or just don't bother?
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

func (lc *LocalClient) Start(runID, url string, a []accounts.Classroom) error {
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
	cmd.Env = []string{
		"NODE_OPTIONS=--max-old-space-size=4096", // v8 heap memory in MB
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	lc.proc = cmd.Process
	return nil
}

func (lc *LocalClient) Stop() error {
	return lc.proc.Signal(os.Interrupt)
}
