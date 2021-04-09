// The actual runner implementation is in the /loadrunner directory. This
// package just implements an interface to the runner. It allows the controller
// to start and stop runner instances.

package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/controller/provisioner"
)

const (
	// ClassesPerRunner is the number of classes a single runner can manage simultaneously
	ClassesPerRunner = 10

	agentImage  = "datadog/agent:latest"
	runnerImage = "jsteinmann/load-tests-runner:latest"
)

var runnerCounter = 0

type Client interface {
	Start(ctx context.Context, runID, url string, accounts []accounts.Classroom) error
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

func (rc *RemoteClient) Start(ctx context.Context, runID, url string, a []accounts.Classroom) error {
	accountsJson, err := json.Marshal(a)
	if err != nil {
		return err
	}

	runnerCounter += 1
	instID := fmt.Sprintf("%s-%d", runID, runnerCounter)
	inst, err := rc.provisioner.Provision(ctx, instID)
	if err != nil {
		return fmt.Errorf("failed to provision instance: %w", err)
	}

	log.Println("Deploying agent to", inst)
	cmd := agentCmd(rc.ddApiKey)
	if err = inst.RunCmd(ctx, cmd); err != nil {
		inst.Destroy()
		return fmt.Errorf("failed to start statsD agent on host %s: %w", inst, err)
	}

	log.Println("Deploying runner to", inst)
	cmd = runnerCmd(runID, url, string(accountsJson))
	if err = inst.RunCmd(ctx, cmd); err != nil {
		inst.Destroy()
		return fmt.Errorf("failed to start runner on host %s: %w", inst, err)
	}

	rc.instance = inst

	log.Println(inst, "ready")

	return nil
}

func agentCmd(ddApiKey string) string {
	return fmt.Sprintf(`docker run \
	--detach \
	--name dd-agent \
	-v /var/run/docker.sock:/var/run/docker.sock:ro \
	-v /proc/:/host/proc/:ro \
	-v /sys/fs/cgroup/:/host/sys/fs/cgroup:ro \
	-p 8125:8125/udp \
	--env DD_API_KEY=%s \
	--env DD_DOGSTATSD_NON_LOCAL_TRAFFIC=true \
	%s`, ddApiKey, agentImage)
}

func runnerCmd(runID, url, accounts string) string {
	return fmt.Sprintf(`docker run \
	--detach \
	--ipc=host \
	--env NODE_OPTIONS=--max-old-space-size=8192 \
	--env PRODUCTION=true \
	--env DD_AGENT_HOST=dd-agent \
	--env RUN_ID=%s \
	--env URL=%s \
	--env 'ACCOUNTS=%s' \
	%s`, runID, url, accounts, runnerImage)
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

func (lc *LocalClient) Start(_ctx context.Context, runID, url string, a []accounts.Classroom) error {
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
