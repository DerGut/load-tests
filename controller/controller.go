package controller

import (
	"context"
	"log"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/controller/runner"
)

type Controller interface {
	Run(ctx context.Context, cfg RunConfig) error
}
type RunConfig struct {
	RunID     string
	Url       string
	LoadCurve *LoadCurve
	Accounts  []accounts.Classroom
}

type RunnerFunc func() runner.Client
type controller struct {
	RunnerFunc
	activeRunners []runner.Client
}

func NewLocal() Controller {
	return &controller{
		RunnerFunc: func() runner.Client {
			return runner.NewLocal()
		},
	}
}

func NewRemote(doApiToken, ddApiKey, region, size string) Controller {
	return &controller{
		RunnerFunc: func() runner.Client {
			return runner.NewRemote(doApiToken, ddApiKey, region, size)
		},
	}
}

func (c *controller) Run(ctx context.Context, cfg RunConfig) error {
	cfg.LoadCurve.Start()
	accountIdx := 0
	defer c.cleanup()

	for {
		select {
		case load, more := <-cfg.LoadCurve.C:
			if !more {
				log.Println("Test is over, cleaning up")
				return nil
			}
			c.nextStep(cfg.RunID, cfg.Url, cfg.Accounts[accountIdx:accountIdx+load])
			accountIdx += load
		case <-ctx.Done():
			cfg.LoadCurve.Stop()
			return ctx.Err()
		}
	}
}

func (c *controller) nextStep(runID string, url string, accs []accounts.Classroom) {
	accsByRunner := batchAccounts(accs)

	log.Println("Starting", len(accsByRunner), "runners with", len(accs), "classes in total")
	runners := c.startRunners(runID, url, accsByRunner)
	c.activeRunners = append(c.activeRunners, runners...)
}

func batchAccounts(accs []accounts.Classroom) [][]accounts.Classroom {
	var batches [][]accounts.Classroom
	for i := 0; i < len(accs); i += runner.ClassesPerRunner {
		if i+runner.ClassesPerRunner > len(accs) {
			remaining := len(accs) - i
			batches = append(batches, accs[i:remaining])
		} else {
			batches = append(batches, accs[i:i+runner.ClassesPerRunner])
		}
	}

	return batches
}

func (c *controller) startRunners(runID, url string, accsByRunner [][]accounts.Classroom) []runner.Client {
	rCh := make(chan runner.Client, len(accsByRunner))
	for _, accs := range accsByRunner {
		go func(a []accounts.Classroom) {
			r := c.RunnerFunc()
			if err := r.Start(runID, url, a); err != nil {
				log.Println("Error occured while starting local runner:", err)
				rCh <- nil
			}
			rCh <- r
		}(accs)
	}

	var runners []runner.Client
	for i := 0; i < len(accsByRunner); i++ {
		r := <-rCh
		if r != nil {
			runners = append(runners, r)
		}
	}

	return runners
}

func (c *controller) cleanup() {
	for _, r := range c.activeRunners {
		if err := r.Stop(); err != nil {
			log.Println("failed to stop runner", err)
		}
	}
}
