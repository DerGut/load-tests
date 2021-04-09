package provisioner

import "context"

type Provisioner interface {
	Provision(ctx context.Context, instanceID string) (Instance, error)
}

type Instance interface {
	RunCmd(ctx context.Context, cmd string) error
	Destroy() error
	String() string
}
