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
	"sync/atomic"
	"time"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/controller/provisioner"
)

const (
	// ClassesPerRunner is the number of classes a single runner can manage simultaneously
	ClassesPerRunner = 2

	agentImage  = "datadog/agent:latest"
	runnerImage = "jsteinmann/load-tests-runner:latest"
)

var runnerCounter int32 = 0

type Client interface {
	Start(context.Context, *Step, provisioner.Provisioner) error
	Stop() error
}

func NewRemote(runID, ddApiKey string) Client {
	currentCounter := atomic.AddInt32(&runnerCounter, 1)
	return &RemoteClient{
		runID:    runID,
		name:     fmt.Sprintf("%s-%d", runID, currentCounter),
		ddApiKey: ddApiKey,
	}
}

type RemoteClient struct {
	runID    string
	name     string
	ddApiKey string
	instance provisioner.Instance
}

type Step struct {
	Url      string
	Accounts []accounts.Classroom
}

func (rc *RemoteClient) Start(ctx context.Context, step *Step, p provisioner.Provisioner) error {
	inst, err := p.Provision(ctx, rc.name)
	if err != nil {
		return fmt.Errorf("failed to provision instance: %w", err)
	}

	err = rc.deploy(ctx, inst, step)
	if err != nil {
		inst.Destroy()
		return fmt.Errorf("failed runner deployment: %w", err)
	}

	rc.instance = inst

	log.Println(inst, "ready")

	return nil
}

func (rc *RemoteClient) deploy(ctx context.Context, inst provisioner.Instance, step *Step) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		if err := inst.RunCmd(ctx, "docker network create load-tests"); err != nil {
			return fmt.Errorf("failed to create docker network on host %s: %w", inst, err)
		}
	}

	log.Println("Deploying agent to", inst)
	cmd := agentCmd(rc.ddApiKey, rc.runID)
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		if err := inst.RunCmd(ctx, cmd); err != nil {
			return fmt.Errorf("failed to start statsD agent on host %s: %w", inst, err)
		}
	}

	// Let agent start up first to catch all metrics
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(1 * time.Minute):
	}

	if err := inst.RunCmd(ctx, "mkdir -p /root/errors && chmod 777 /root/errors "); err != nil {
		log.Println("Failed creating error dir")
	}

	accountsJson, err := json.Marshal(step.Accounts)
	if err != nil {
		return err
	}

	log.Println("Deploying runner to", inst)
	cmd = runnerCmd(rc.runID, step.Url, string(accountsJson))
	if err := inst.RunCmd(ctx, cmd); err != nil {
		return fmt.Errorf("failed to start runner on host %s: %w", inst, err)
	}

	return nil
}

func agentCmd(ddApiKey, runID string) string {
	return fmt.Sprintf(`docker run \
	--detach \
	--name dd-agent \
	--network load-tests \
	--volume /var/run/docker.sock:/var/run/docker.sock:ro \
	--volume /proc/:/host/proc/:ro \
	--volume /opt/datadog-agent/run:/opt/datadog-agent/run:rw \
	--volume /sys/fs/cgroup/:/host/sys/fs/cgroup:ro \
	--volume /etc/passwd:/etc/passwd:ro \
	--publish 8125:8125/udp \
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
	--volume /root/errors:/home/pwuser/runner/errors \
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
	// Graceful shutdown allows runner to update metrics that track numbers of runners, VUs, etc.
	// TODO: the exercise think time is probably the limiting factor here. If we really want
	// to shut down gracefully, we either need to wait for ~5min or periodically check for shutdown
	// events while the VU is sleeping/ thinking
	timeout := 5 * 60 // in seconds
	err := rc.instance.RunCmd(context.TODO(), fmt.Sprintf("docker stop --time %d runner", timeout))
	if err != nil {
		log.Println("Graceful shutdown failed")
	}

	log.Println("Destroying", rc.instance)
	return rc.instance.Destroy()
}

func (rc *RemoteClient) String() string {
	return rc.name
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

func (lc *LocalClient) Start(_ctx context.Context, s *Step, _ provisioner.Provisioner) error {
	accountsJson, err := json.Marshal(s.Accounts)
	if err != nil {
		return err
	}

	cmd := exec.Command(
		"node",
		runnerFile,
		"local-run",
		s.Url,
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
	if err := lc.proc.Signal(os.Interrupt); err != nil {
		return err
	}
	_, err := lc.proc.Wait()
	return err
}

func (lc *LocalClient) String() string {
	return "local"
}
