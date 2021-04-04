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

type localController struct {
	activeRunners []runner.Client
}

func NewLocal() Controller {
	return &localController{}
}

func (c *localController) Run(ctx context.Context, cfg RunConfig) error {
	cfg.LoadCurve.Start()
	accountIdx := 0

	for {
		select {
		case load, more := <-cfg.LoadCurve.C:
			if !more {
				c.cleanup()
				return nil
			}
			c.nextStep(cfg.RunID, cfg.Url, cfg.Accounts[accountIdx:accountIdx+load])
			accountIdx += load
		case <-ctx.Done():
			cfg.LoadCurve.Stop()
			c.cleanup()
			return ctx.Err()
		}
	}
}

func (c *localController) nextStep(runID string, url string, accs []accounts.Classroom) {
	accsByRunner := batchAccounts(accs)

	log.Println("Starting", len(accsByRunner), "runners with", len(accs), "classes in total")
	runners := startRunners(runID, url, accsByRunner)
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

func startRunners(runID, url string, accsByRunner [][]accounts.Classroom) []runner.Client {
	rCh := make(chan runner.Client, len(accsByRunner))
	for _, accs := range accsByRunner {
		go func(a []accounts.Classroom) {
			r := runner.NewLocal()
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

func (c *localController) cleanup() {
	for _, r := range c.activeRunners {
		if err := r.Stop(); err != nil {
			log.Println("failed to stop runner", err)
		}
	}
}
