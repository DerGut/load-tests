package provisioner

import (
	"fmt"
	"log"

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

	return &doInstance{apiToken: dop.apiToken, droplet: d}, nil
}

type doInstance struct {
	apiToken string
	droplet  *do.Droplet
}

func (doi *doInstance) StartProcess(cmd string) error {
	addr, err := doi.droplet.PublicIPv4()
	if err != nil {
		return err
	}

	return sshStart(cmd, addr+":"+defaultSSHPort)
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

func sshStart(cmd string, addr string) error {
	c := ssh.NewClient(defaultUser, addr)
	s, err := c.Session()
	if err != nil {
		return err
	}

	return s.Start(cmd)
}
