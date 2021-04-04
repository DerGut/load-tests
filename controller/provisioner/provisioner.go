package provisioner

type Provisioner interface {
	Provision() (Instance, error)
}

type Instance interface {
	StartProcess(cmd string) error
	Destroy() error
}
