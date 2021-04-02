package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/DerGut/load-tests/accounts"
	"github.com/DerGut/load-tests/controller"
)

var (
	url             string
	resetDb         bool
	dbUri           string
	loadLevels      controller.LoadLevels
	stepSize        time.Duration
	classSize       int
	preparedPortion float64
	remote          bool
)

func init() {
	flag.StringVar(&url, "url", "https://prototyp.pearup.de", "The URL to the system under test.")
	flag.BoolVar(&resetDb, "resetDb", true, "Whether or not to reset the mongo instance.")
	flag.StringVar(&dbUri, "dbUri", "", "The URI to the mongo instance.")
	flag.Var(&loadLevels, "loadLevels", "A comma-separated list of class concurrencies.")
	flag.DurationVar(&stepSize, "stepSize", 15*time.Minute, "time between each step of the load curve.")
	flag.IntVar(&classSize, "classSize", 30, "The number of pupils within a class.")
	flag.Float64Var(&preparedPortion, "preparedPortion", 0.3, "The portion of classes for which accounts should be created beforehand.")
	flag.BoolVar(&remote, "remote", true, "Whether to provision remote machines to run the tests. If false, they will be run locally.")
	flag.Parse()
}

func main() {
	conf, err := parseConfig()
	if err != nil {
		log.Fatalln("Couldn't parse config", err)
	}

	accs := setupAccounts(conf)
	ctlConf := parseControllerConfig(conf, accs)

	var c controller.Controller
	if remote {
		log.Fatalln("No remote runner implemented yet")
	} else {
		c = controller.NewLocal(ctlConf)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	go func() {
		s := <-sigCh
		log.Println("Received signal:", s)
		cancel()
	}()

	log.Println("Starting controller")
	if err := c.Run(ctx); err != nil {
		log.Fatalln("failed running:", err)
	}
}

type Config struct {
	url             string
	resetDb         bool
	dbUri           string
	loadLevels      controller.LoadLevels
	stepSize        time.Duration
	classSize       int
	preparedPortion float64
	remote          bool
}

func parseConfig() (*Config, error) {
	if !flag.Parsed() {
		flag.Parse()
	}

	if resetDb && dbUri == "" {
		return nil, errors.New("either resetDb should be false or a valid URI to dbUri should be given")
	}

	return &Config{url, resetDb, dbUri, loadLevels, stepSize, classSize, preparedPortion, remote}, nil
}

func parseControllerConfig(conf *Config, accounts []accounts.Classroom) controller.Config {
	lc := controller.NewLoadCurve(conf.loadLevels, conf.stepSize)
	return controller.Config{
		Url:       conf.url,
		LoadCurve: lc,
		Accounts:  accounts,
	}
}

func setupAccounts(conf *Config) []accounts.Classroom {
	accs, err := accounts.Read()

	maxConcurrency := maxConcurrency(conf.loadLevels)
	if err != nil {
		if os.IsNotExist(err) {
			generateAccountsAndExit(maxConcurrency)
		}
		log.Fatalln("Failed to read accounts file", err)
	}
	if len(accs) < maxConcurrency {
		log.Println("Not enough accounts in current dump to satisfy max concurrency of", maxConcurrency, "generating new accounts file")
		generateAccountsAndExit(maxConcurrency)
	}

	if conf.resetDb {
		log.Println("Resetting MongoDB instance with dumped data")
		if err = accounts.Restore(context.TODO(), dbUri, accounts.DefaultDumpFile); err != nil {
			log.Fatalln(err)
		}
	}

	return accs
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

func generateAccountsAndExit(maxConcurrency int) {
	if err := accounts.Generate(maxConcurrency, classSize, float32(preparedPortion)); err != nil {
		log.Fatalln("Failed to generate accounts file", err)
	}
	log.Println("A new accounts file has been created. Please create a mongodb dump from it by running the local Meteor server")
	os.Exit(0)
}
