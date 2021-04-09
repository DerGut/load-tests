package provisioner

type Provisioner interface {
	Provision(instanceID string) (Instance, error)
}

type Instance interface {
	RunCmd(cmd string) error
	Destroy() error
	String() string
}
