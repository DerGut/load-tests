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
	"github.com/DerGut/load-tests/cmd/config"
	"github.com/DerGut/load-tests/controller"
)

func main() {
	conf := config.Parse()

	accs := setupAccounts(conf)
	runCfg := parseRunConfig(conf, accs)

	var c controller.Controller
	if conf.DoApiKey != "" {
		c = controller.NewRemote(conf.DoApiKey, conf.DdApiKey, conf.DoRegion, conf.DoSize)
	} else {
		c = controller.NewLocal()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	handleSignal(cancel)

	log.Println("Starting controller")
	if err := c.Run(ctx, runCfg); err != nil {
		log.Fatalln("failed running:", err)
	}
}

func setupAccounts(conf *config.Config) []accounts.Classroom {
	maxConcurrency := maxConcurrency(conf.LoadLevels)

	accs, err := accounts.Get(maxConcurrency, conf.ClassSize)
	if err != nil {
		if os.IsNotExist(err) || errors.Is(err, accounts.ErrDumpTooSmall) {
			generateAccounts(maxConcurrency, conf.ClassSize, conf.PreparedPortion)
			os.Exit(0)
		}
		log.Fatalln("Couldn't read accounts:", err)
	}

	if conf.DbUri != "" {
		restoreDump(conf.DbUri)
	}

	return accs
}

func parseRunConfig(conf *config.Config, accounts []accounts.Classroom) controller.RunConfig {
	lc := controller.NewLoadCurve(conf.LoadLevels, conf.StepSize)
	return controller.RunConfig{
		RunID:     runID(),
		Url:       conf.Url,
		LoadCurve: lc,
		Accounts:  accounts,
	}
}

const (
	chars    = "1234567890abcdefghijklmnopqrstuvwxyz"
	runIDLen = 6
)

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

func generateAccounts(maxConcurrency, classSize int, preparedPortion float64) {
	log.Println("Generating new accounts file")
	if err := accounts.Generate(maxConcurrency, classSize, preparedPortion); err != nil {
		log.Fatalln("Failed to generate accounts file", err)
	}
	log.Println("A new accounts file has been created. Please create a mongodb dump from it by running the local Meteor server")
}

func restoreDump(dbUri string) {
	log.Println("Resetting MongoDB instance with dumped data")
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()
	if err := accounts.Restore(ctx, dbUri, accounts.DefaultDumpFile); err != nil {
		log.Fatalln("Failed to restore dump:", err)
	}
}
