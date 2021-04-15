package controller

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

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
	accountIdx := 0
	defer c.cleanup()

	currentLoad := 0
	for _, load := range cfg.LoadCurve.LoadLevels {
		log.Println("Next step with", load, "running classes")
		toAdd := load - currentLoad
		if toAdd < 0 {
			panic("No Load decrease implemented yet")
		}
		if toAdd > 0 {
			if err := c.nextStep(ctx, cfg.RunID, cfg.Url, cfg.Accounts[accountIdx:accountIdx+toAdd]); err != nil {
				return err
			}
			accountIdx += toAdd
		}
		currentLoad = load

		select {
		case <-time.After(cfg.LoadCurve.StepSize.Duration):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	log.Println("Test is over")
	return nil
}

func (c *controller) nextStep(ctx context.Context, runID string, url string, accs []accounts.Classroom) error {
	accsByRunner := batchAccounts(accs)

	log.Println("Starting", len(accsByRunner), "runner(s) with", len(accs), "classes in total")
	runners, err := c.startRunners(ctx, runID, url, accsByRunner)
	if err != nil {
		return err
	}

	c.activeRunners = append(c.activeRunners, runners...)
	return nil
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

type runnerResult struct {
	runner.Client
	err error
}

func (c *controller) startRunners(ctx context.Context, runID, url string, accsByRunner [][]accounts.Classroom) ([]runner.Client, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	ch := make(chan runnerResult, len(accsByRunner))
	for _, accs := range accsByRunner {
		go func(a []accounts.Classroom) {
			r := c.RunnerFunc()
			if err := r.Start(ctx, runID, url, a); err != nil {
				ch <- runnerResult{nil, err}
			} else {
				ch <- runnerResult{r, nil}
			}
		}(accs)
	}

	var runners []runner.Client
	var err error
	for i := 0; i < len(accsByRunner); i++ {
		r := <-ch
		if r.err != nil {
			if errors.Is(r.err, context.Canceled) {
				continue
			}
			err = r.err
			cancel()
		} else {
			runners = append(runners, r.Client)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("error occured while starting runner: %w", err)
	}

	return runners, nil
}

func (c *controller) cleanup() {
	log.Println("Cleaning up")
	for _, r := range c.activeRunners {
		if err := r.Stop(); err != nil {
			log.Println("failed to stop runner", err)
		}
	}
}
