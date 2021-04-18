package main

import (
	"context"
	"errors"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"time"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/cmd/loadctl/config"
	"github.com/DerGut/load-tests/controller"
	"github.com/DerGut/load-tests/controller/provisioner"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

func main() {
	conf := config.Parse()

	accs := setupAccounts(conf)

	// Shuffle in order to use prepared and unprepared classes evenly throughout the test run
	shuffle(accs)
	runCfg := parseRunConfig(conf, accs)

	p := provisioner.NewDO(conf.DoApiKey, conf.DoRegion, conf.DoSize)

	var c controller.Controller
	if conf.Local {
		c = controller.NewLocal()
	} else {
		c = controller.NewRemote(runID(), p, conf.DdApiKey)
	}

	// Wait one step size longer for graceful shutdown
	timeout := time.Duration(len(conf.LoadLevels)+1) * conf.StepSize.Duration
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	handleSignal(cancel)

	log.Println("Starting controller")
	if err := c.Run(ctx, runCfg); err != nil {
		if errors.Is(err, context.Canceled) {
			os.Exit(0)
		}
		if errors.Is(err, context.DeadlineExceeded) {
			log.Println("Exceeded deadline")
			os.Exit(1)
		}
		log.Fatalln("failed running:", err)
	}
}

func setupAccounts(conf *config.Config) []accounts.Classroom {
	maxConcurrency := maxConcurrency(conf.LoadLevels)

	accs, err := accounts.Get(maxConcurrency, conf.ClassSize, conf.PreparedPortion)
	if err != nil {
		log.Fatalln("Couldn't get accounts:", err)
	}

	if !conf.NoReset {
		restoreDump(conf.DbUri)
	}

	return accs
}

func shuffle(accs []accounts.Classroom) {
	rand.Shuffle(len(accs), func(i, j int) {
		tmp := accs[i]
		accs[i] = accs[j]
		accs[j] = tmp
	})
}

func parseRunConfig(conf *config.Config, accounts []accounts.Classroom) controller.RunConfig {
	lc := controller.LoadCurve{LoadLevels: conf.LoadLevels, StepSize: conf.StepSize}
	return controller.RunConfig{
		Url:       conf.Url,
		LoadCurve: &lc,
		Accounts:  accounts,
	}
}

const (
	chars    = "1234567890abcdefghijklmnopqrstuvwxyz"
	runIDLen = 6
)

// runID generates a random 6 character long alpha-numeric string ID
func runID() string {
	b := make([]byte, runIDLen)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func handleSignal(cancel context.CancelFunc) {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt)
	go func() {
		s := <-sigCh
		log.Println("Received signal:", s)
		cancel()
	}()
}

func maxConcurrency(levels controller.LoadLevels) int {
	max := 0
	for _, l := range levels {
		if l > max {
			max = l
		}
	}

	return max
}

func restoreDump(dbUri string) {
	log.Println("Resetting MongoDB instance with dumped data")
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()
	if err := accounts.Restore(ctx, dbUri, accounts.DefaultDumpFile); err != nil {
		log.Fatalln("Failed to restore dump:", err)
	}
}
