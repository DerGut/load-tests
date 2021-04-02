package controller

import (
	"context"
	"log"
	"math"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/controller/runner"
)

type Controller interface {
	Run(ctx context.Context) error
}

type Config struct {
	Url       string
	LoadCurve *LoadCurve
	Accounts  []accounts.Classroom
}

type localController struct {
	url           string
	accountIdx    int
	loadCurve     *LoadCurve
	accounts      []accounts.Classroom
	activeRunners []runner.Client
}

func NewLocal(config Config) Controller {
	return &localController{url: config.Url, loadCurve: config.LoadCurve, accounts: config.Accounts}
}

func (c *localController) Run(ctx context.Context) error {
	c.loadCurve.Start()
	c.accountIdx = 0

	for {
		select {
		case load, more := <-c.loadCurve.C:
			if !more {
				c.cleanup()
				return nil
			}
			c.nextStep(load)
		case <-ctx.Done():
			c.cleanup()
			return ctx.Err()
		}
	}
}

func (c *localController) nextStep(load int) {
	number := runnersForStep(load)
	accsByRunner := c.nextAccounts(number, load)

	log.Println("Starting", number, "runners with", load, "classes in total")
	runners := startRunners(c.url, accsByRunner)
	c.activeRunners = append(c.activeRunners, runners...)
}

func (c *localController) nextAccounts(runners, classes int) [][]accounts.Classroom {
	var a [][]accounts.Classroom
	for i := c.accountIdx; i < c.accountIdx+classes; i += runner.ClassesPerRunner {
		if i+runner.ClassesPerRunner > classes {
			remaining := classes - i
			a = append(a, c.accounts[i:remaining])
			break
		}
		a = append(a, c.accounts[i:i+runner.ClassesPerRunner])
	}
	c.accountIdx += classes
	return a
}

func startRunners(url string, accsByRunner [][]accounts.Classroom) []runner.Client {
	rCh := make(chan runner.Client, len(accsByRunner))
	for _, accs := range accsByRunner {
		go func(a []accounts.Classroom) {
			r := runner.NewLocal()
			if err := r.Start(url, a); err != nil {
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

func runnersForStep(numClasses int) int {
	return int(math.Ceil(float64(runner.ClassesPerRunner) / float64(numClasses)))
}

func (c *localController) cleanup() {
	c.loadCurve.Stop() // maybe check if stopped already
	for _, r := range c.activeRunners {
		if err := r.Stop(); err != nil {
			log.Println("failed to stop runner", err)
		}
	}
}
