package runner

import (
	"testing"
)

func Test_BuildDockerRunCmd(t *testing.T) {
	dockerArgs := []string{"--ipc=host"}
	env := []string{"SOME_ENV_VAR=12345"}
	cmdArgs := []string{"--test=true"}

	cmd := BuildDockerRunCmd("test/image:latest", dockerArgs, env, cmdArgs)

	if cmd != "docker run --ipc=host --env SOME_ENV_VAR=12345 test/image:latest --test=true" {
		t.Fatal("cmd was:", cmd)
	}
}
