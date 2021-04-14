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
	"time"

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

	if err = inst.RunCmd(ctx, "docker network create load-tests"); err != nil {
		inst.Destroy()
		return fmt.Errorf("failed to create docker network on host %s: %w", inst, err)
	}

	log.Println("Deploying agent to", inst)
	cmd := agentCmd(rc.ddApiKey, runID)
	if err = inst.RunCmd(ctx, cmd); err != nil {
		inst.Destroy()
		return fmt.Errorf("failed to start statsD agent on host %s: %w", inst, err)
	}

	// Let agent start up first to catch all metrics
	time.Sleep(1 * time.Minute)

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

func agentCmd(ddApiKey, runID string) string {
	return fmt.Sprintf(`docker run \
	--detach \
	--name dd-agent \
	--network load-tests \
	-v /var/run/docker.sock:/var/run/docker.sock:ro \
	-v /proc/:/host/proc/:ro \
	-v /opt/datadog-agent/run:/opt/datadog-agent/run:rw \
	-v /sys/fs/cgroup/:/host/sys/fs/cgroup:ro \
	-v /etc/passwd:/etc/passwd:ro \
	-p 8125:8125/udp \
	--env DD_API_KEY=%s \
	--env DD_TAGS=runId:%s \
	--env DD_ENV=load-tests \
	--env DD_DOGSTATSD_NON_LOCAL_TRAFFIC=true \
	--env DD_APM_ENABLED=true \
	--env DD_LOGS_ENABLED=true \
	--env DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL=true \
	--env DD_CONTAINER_EXCLUDE="name:dd-agent" \
	--env DD_APM_NON_LOCAL_TRAFFIC=true \
	--env DD_PROCESS_AGENT_ENABLED=true \
	%s`, ddApiKey, runID, agentImage)
}

func runnerCmd(runID, url, accounts string) string {
	return fmt.Sprintf(`docker run \
	--detach \
	--name runner \
	--network load-tests \
	--ipc=host \
	--env NODE_OPTIONS=--max-old-space-size=4096 \
	--env NODE_ENV=production \
	--env DD_AGENT_HOST=dd-agent \
	--env DD_TRACE_AGENT_HOSTNAME=dd-agent \
	--env DD_RUNTIME_METRICS_ENABLED=true \
	--env DD_TAGS=runId:%s \
	--env RUN_ID=%s \
	--env URL=%s \
	--env 'ACCOUNTS=%s' \
	%s`, runID, runID, url, accounts, runnerImage)
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
