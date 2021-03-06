package controller

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/controller/provisioner"
	"github.com/DerGut/load-tests/controller/runner"
)

type Controller interface {
	Run(ctx context.Context, cfg RunConfig) error
}
type RunConfig struct {
	Url       string
	LoadCurve *LoadCurve
	Accounts  []accounts.Classroom
}

type RunnerFunc func() runner.Client
type controller struct {
	RunnerFunc
	runID            string
	classesPerRunner int
	runners          activeRunners
	provisioner      provisioner.Provisioner
}

type activeRunners struct {
	sync.Locker
	active []runner.Client
}

func NewLocal() Controller {
	return &controller{
		RunnerFunc: func() runner.Client {
			return runner.NewLocal()
		},
		// Locally we only have one runner an it needs to support
		// any number of classes for testing purposes
		classesPerRunner: math.MaxInt32,
		runners:          activeRunners{Locker: &sync.Mutex{}},
	}
}

func NewRemote(runID string, classesPerRunner int, p provisioner.Provisioner, ddApiKey string) Controller {
	return &controller{
		runID:            runID,
		classesPerRunner: classesPerRunner,
		runners:          activeRunners{Locker: &sync.Mutex{}},
		provisioner:      p,
		RunnerFunc: func() runner.Client {
			return runner.NewRemote(runID, ddApiKey)
		},
	}
}

func (c *controller) Run(ctx context.Context, cfg RunConfig) error {
	defer c.cleanup()

	errCh := make(chan error)
	wg := sync.WaitGroup{}
	defer wg.Wait()

	accountIdx := 0
	currentLoad := 0
	for _, load := range cfg.LoadCurve.LoadLevels {
		log.Println("Next step with", load, "running classes")
		toAdd := load - currentLoad
		if toAdd < 0 {
			panic("No Load decrease implemented yet")
		}

		if toAdd > 0 {
			wg.Add(1)
			batch := cfg.Accounts[accountIdx : accountIdx+toAdd]
			go func(b []accounts.Classroom) {
				err := c.nextStep(ctx, c.runID, cfg.Url, b)
				if err != nil {
					errCh <- err
				}
				wg.Done()
			}(batch)
			accountIdx += toAdd
		}
		currentLoad = load

		select {
		case <-time.After(cfg.LoadCurve.StepSize.Duration):
			// wait before continuing with the next step
		case <-ctx.Done():
			return ctx.Err()
		case err := <-errCh:
			return err
		}
	}

	log.Println("Test is over")
	return nil
}

func (c *controller) nextStep(ctx context.Context, runID string, url string, accs []accounts.Classroom) error {
	accsByRunner := batchAccounts(accs, c.classesPerRunner)

	log.Println("Starting", len(accsByRunner), "runner(s) with", len(accs), "classes in total")
	runners, err := c.startRunners(ctx, runID, url, accsByRunner)
	if err != nil {
		return err
	}

	c.runners.Lock()
	defer c.runners.Unlock()
	c.runners.active = append(c.runners.active, runners...)
	return nil
}

func batchAccounts(accs []accounts.Classroom, classesPerRunner int) [][]accounts.Classroom {
	var batches [][]accounts.Classroom
	for i := 0; i < len(accs); i += classesPerRunner {
		if i+classesPerRunner > len(accs) {
			batches = append(batches, accs[i:])
		} else {
			batches = append(batches, accs[i:i+classesPerRunner])
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
		r := c.RunnerFunc()
		s := runner.Step{Url: url, Accounts: accs}
		go func(step *runner.Step) {
			if err := r.Start(ctx, step, c.provisioner); err != nil {
				ch <- runnerResult{nil, err}
			} else {
				ch <- runnerResult{r, nil}
			}
		}(&s)
	}

	var runners []runner.Client
	var err error
	for i := 0; i < len(accsByRunner); i++ {
		r := <-ch
		if r.err != nil {
			if errors.Is(r.err, context.Canceled) {
				continue
			}
			log.Println("Error while starting runner:", r.err)
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

	wg := sync.WaitGroup{}
	c.runners.Lock()
	defer c.runners.Unlock()
	for _, run := range c.runners.active {
		wg.Add(1)
		go func(r runner.Client) {
			log.Println("Stopping runner:", r)
			if err := r.Stop(); err != nil {
				log.Println("failed to stop, please stop manually", err)
			}
			wg.Done()
		}(run)
	}

	wg.Wait()
}
