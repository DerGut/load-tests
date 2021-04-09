package provisioner

import (
	"errors"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/DerGut/load-tests/ssh"
	"github.com/digitalocean/doctl/do"
	"github.com/digitalocean/godo"
)

const (
	defaultUser    = "root"
	defaultSSHPort = "22"
)

type doProvisioner struct {
	apiToken    string
	region      string
	dropletSize string
	sshKeyIDs   []godo.DropletCreateSSHKey
}

func NewDO(apiToken, region, dropletSize string) Provisioner {
	return &doProvisioner{
		apiToken:    apiToken,
		region:      region,
		dropletSize: dropletSize,
		sshKeyIDs: []godo.DropletCreateSSHKey{
			{ID: 22074350},
			{ID: 26570780},
		},
	}
}

func (dop *doProvisioner) Provision(instanceID string) (Instance, error) {
	client := godo.NewFromToken(dop.apiToken)
	ds := do.NewDropletsService(client)

	req := godo.DropletCreateRequest{
		Name:       fmt.Sprintf("do-%s-%s-%s", dop.dropletSize, dop.region, instanceID),
		Region:     dop.region,
		Size:       dop.dropletSize,
		Image:      godo.DropletCreateImage{Slug: "docker-20-04"},
		SSHKeys:    dop.sshKeyIDs,
		Tags:       []string{instanceID},
		Monitoring: true,
	}

	log.Println("Creating", req.Name)

	d, err := ds.Create(&req, true)
	if err != nil {
		return nil, err
	}

	inst := &doInstance{apiToken: dop.apiToken, droplet: d}
	if err = blockTillReady(inst); err != nil {
		return nil, err
	}

	return inst, nil
}

type doInstance struct {
	apiToken string
	droplet  *do.Droplet
}

func (doi *doInstance) RunCmd(cmd string) error {
	addr, err := doi.droplet.PublicIPv4()
	if err != nil {
		return err
	}

	return sshRun(cmd, addr)
}

func (doi *doInstance) Destroy() error {
	client := godo.NewFromToken(doi.apiToken)
	ds := do.NewDropletsService(client)

	log.Println("Destroying", doi.droplet.Name)

	return ds.Delete(doi.droplet.ID)
}

func (doi *doInstance) String() string {
	return doi.droplet.Name
}

func (doi *doInstance) isReady() bool {
	addr, err := doi.droplet.PublicIPv4()
	if err != nil {
		log.Println("addr is not available")
		return false
	}

	err = sshRun("ls", addr)
	if err != nil {
		log.Println(err)
		return false
	}

	return true
}

const (
	backoffModifier = 1 * time.Second
	maxTries        = 10
)

// blockTillReady checks the instance for readiness with exponential backoff.
func blockTillReady(inst *doInstance) error {
	time.Sleep(5 * time.Second)
	for i := 0.0; i < maxTries; i++ {
		if inst.isReady() {
			return nil
		}
		backoff := time.Duration(math.Pow(2.0, i))
		time.Sleep(backoff * backoffModifier) // 1s to 512s
	}
	return errors.New("not ready after configured timeout")
}

func sshStart(cmd string, addr string) error {
	s, err := sshSession(addr)
	if err != nil {
		return err
	}

	return s.Start(cmd)
}

func sshRun(cmd string, addr string) error {
	s, err := sshSession(addr)
	if err != nil {
		return err
	}

	if err := s.Run(cmd); err != nil {
		return fmt.Errorf("can't run cmd: %w", err)
	}
	return nil
}

func sshSession(addr string) (*ssh.Session, error) {
	c, err := ssh.NewClient(defaultUser, addr+":"+defaultSSHPort)
	if err != nil {
		return nil, fmt.Errorf("can't establish client: %w", err)
	}

	return c.Session()
}
