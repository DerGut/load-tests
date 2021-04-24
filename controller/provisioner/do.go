package provisioner

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/DerGut/load-tests/ssh"
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
	debug       bool
}

func NewDO(apiToken, region, dropletSize string, debug bool) Provisioner {
	return &doProvisioner{
		apiToken:    apiToken,
		region:      region,
		dropletSize: dropletSize,
		sshKeyIDs: []godo.DropletCreateSSHKey{
			{ID: 22074350},
			{ID: 26570780},
		},
		debug: debug,
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

	if err = waitForReachable(ctx, d); err != nil {
		log.Println("Destroying unreachable droplet:", d.Name)
		if _, errDel := client.Droplets.Delete(context.TODO(), d.ID); errDel != nil {
			log.Printf("Couldn't destroy droplet %s, please do so manually\n", d.Name)
		}
		return nil, err
	}

	return &doInstance{apiToken: dop.apiToken, droplet: d, debug: dop.debug}, nil
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
			log.Println("Failed waiting for droplet to become active, destroying it:", d.Name)
			if _, err := c.Droplets.Delete(context.TODO(), d.ID); err != nil {
				log.Println("Failed to destroy droplet, please do so manually:", d.Name)
			}
			return nil, err
		}
	}

	return d, nil
}

type doInstance struct {
	apiToken string
	droplet  *godo.Droplet
	debug    bool
}

func (doi *doInstance) RunCmd(ctx context.Context, cmd string) error {
	return runCmd(ctx, cmd, doi.droplet, doi.debug)
}

func runCmd(ctx context.Context, cmd string, d *godo.Droplet, debug bool) error {
	addr, err := d.PublicIPv4()
	if err != nil {
		return err
	}

	select {
	case err = <-sshRun(cmd, addr, debug):
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (doi *doInstance) Destroy() error {
	client := godo.NewFromToken(doi.apiToken)
	_, err := client.Droplets.Delete(context.TODO(), doi.droplet.ID)

	return err
}

func (doi *doInstance) String() string {
	return doi.droplet.Name
}

const (
	// ufw on the server side limits SSH connection attempts and blocks after 6 attempts within 30s.
	// We therefore want to ensure no more attempts are made within a 30s period.
	backoffModifier = 10 * time.Second
	maxTries        = 5
)

// waitForReachable checks the instance for SSH readiness with exponential backoff.
func waitForReachable(ctx context.Context, d *godo.Droplet) error {
	for i := 0.0; i < maxTries; i++ {
		if isReachable(d) {
			return nil
		}
		backoff := time.Duration(math.Pow(2.0, i)) * backoffModifier
		log.Println(d.Name, "not yet reachable, trying again in", backoff)
		select {
		case <-time.After(backoff): // 10s to 160s
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return errors.New("not reachable after configured timeout")
}

func isReachable(d *godo.Droplet) bool {
	err := runCmd(context.TODO(), "ls", d, false)
	return err == nil
}

func sshRun(cmd, addr string, copyIO bool) <-chan error {
	c := make(chan error)
	go func() {
		s, err := sshSession(addr)
		if err != nil {
			c <- err
			return
		}

		if copyIO {
			s.Stdout = os.Stdout
			s.Stderr = os.Stderr
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

	s, err := c.Session()
	if err != nil {
		return nil, fmt.Errorf("can't create session: %w", err)
	}

	return s, nil
}
