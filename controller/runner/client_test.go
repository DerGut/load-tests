package runner

import (
	"testing"
)

func Test_BuildDockerRunCmd(t *testing.T) {
	dockerArgs := map[string]string{"ipc": "host"}
	env := map[string]string{"SOME_ENV_VAR": "12345"}
	cmdArgs := map[string]string{"test": "true"}

	cmd := BuildDockerRunCmd("test/image:latest", dockerArgs, env, cmdArgs)

	if cmd != "docker run --ipc=host --env SOME_ENV_VAR=12345 test/image:latest --test=true" {
		t.Fatal("cmd was:", cmd)
	}
}
