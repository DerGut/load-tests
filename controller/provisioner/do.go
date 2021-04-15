package provisioner

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/DerGut/load-tests/ssh"
	"github.com/digitalocean/doctl/do"
	"github.com/digitalocean/godo"
	"github.com/digitalocean/godo/util"
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

func (dop *doProvisioner) Provision(ctx context.Context, instanceID string) (Instance, error) {
	client := godo.NewFromToken(dop.apiToken)

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
	d, err := createDroplet(ctx, client, &req)
	if err != nil {
		return nil, err
	}

	if err = waitForReady(ctx, d); err != nil {
		return nil, err
	}

	return &doInstance{apiToken: dop.apiToken, droplet: d}, nil
}

func createDroplet(ctx context.Context, c *godo.Client, dcr *godo.DropletCreateRequest) (*godo.Droplet, error) {
	d, resp, err := c.Droplets.Create(ctx, dcr)
	if err != nil {
		return nil, err
	}

	var action *godo.LinkAction
	for _, a := range resp.Links.Actions {
		if a.Rel == "create" {
			action = &a
			break
		}
	}

	if action != nil {
		_ = util.WaitForActive(ctx, c, action.HREF)
		d, _, err = c.Droplets.Get(ctx, d.ID)
		if err != nil {
			return nil, err
		}
	}

	return d, nil
}

type doInstance struct {
	apiToken string
	droplet  *godo.Droplet
}

func (doi *doInstance) RunCmd(ctx context.Context, cmd string) error {
	addr, err := doi.droplet.PublicIPv4()
	if err != nil {
		return err
	}

	select {
	case err = <-sshRun(cmd, addr):
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (doi *doInstance) Destroy() error {
	client := godo.NewFromToken(doi.apiToken)
	ds := do.NewDropletsService(client)

	return ds.Delete(doi.droplet.ID)
}

func (doi *doInstance) String() string {
	return doi.droplet.Name
}

const (
	backoffModifier = 1 * time.Second
	maxTries        = 10
)

// waitForReady checks the instance for SSH readiness with exponential backoff.
func waitForReady(ctx context.Context, d *godo.Droplet) error {
	time.Sleep(5 * time.Second)
	for i := 0.0; i < maxTries; i++ {
		if isReady(d) {
			return nil
		}
		backoff := time.Duration(math.Pow(2.0, i))
		select {
		case <-time.After(backoff * backoffModifier): // 1s to 512s
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return errors.New("not ready after configured timeout")
}

func isReady(d *godo.Droplet) bool {
	addr, err := d.PublicIPv4()
	if err != nil {
		log.Println("addr is not available")
		return false
	}

	err = <-sshRun("ls", addr)
	if err != nil {
		log.Println(err)
		return false
	}

	return true
}

func sshRun(cmd string, addr string) <-chan error {
	c := make(chan error)
	go func() {
		s, err := sshSession(addr)
		if err != nil {
			c <- err
			return
		}

		if err := s.Run(cmd); err != nil {
			c <- fmt.Errorf("can't run cmd: %w", err)
			return
		}
		c <- nil
	}()

	return c
}

func sshSession(addr string) (*ssh.Session, error) {
	c, err := ssh.NewClient(defaultUser, addr+":"+defaultSSHPort)
	if err != nil {
		return nil, fmt.Errorf("can't establish client: %w", err)
	}

	return c.Session()
}
