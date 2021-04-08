package provisioner

type Provisioner interface {
	Provision(instanceID string) (Instance, error)
}

type Instance interface {
	StartProcess(cmd string) error
	Destroy() error
	String() string
}
