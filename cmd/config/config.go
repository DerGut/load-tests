package config

import (
	"encoding/json"
	"flag"
	"io/ioutil"
	"log"
	"os"
	"time"

	"github.com/DerGut/load-tests/controller"
)

type Config struct {
	Url             string                `json:"url"`
	DbUri           string                `json:"dbUri"`
	LoadLevels      controller.LoadLevels `json:"loadLevels"`
	StepSize        controller.StepSize   `json:"stepSize"`
	ClassSize       int                   `json:"classSize"`
	PreparedPortion float64               `json:"preparedPortion"`
	DoApiKey        string                `json:"doApiKey"`
	DdApiKey        string                `json:"ddApiKey"`
	DoRegion        string                `json:"ddRegion"`
	DoSize          string                `json:"doSize"`
}

func Parse() *Config {
	c := defaultConfig()
	c.merge(parseConfigFile(configFile))
	c.merge(parseEnvVars())
	c.merge(parseFlags())

	validate(c)

	return c
}

func (c *Config) merge(other *Config) {
	if other.Url != "" {
		c.Url = other.Url
	}
	if other.DbUri != "" {
		c.DbUri = other.DbUri
	}
	if other.LoadLevels != nil {
		c.LoadLevels = other.LoadLevels
	}
	if other.StepSize.Duration > 0 {
		c.StepSize = other.StepSize
	}
	if other.ClassSize > 0 {
		c.ClassSize = other.ClassSize
	}
	if other.PreparedPortion > 0 {
		c.PreparedPortion = other.PreparedPortion
	}
	if other.DoApiKey != "" {
		c.DoApiKey = other.DoApiKey
	}
	if other.DdApiKey != "" {
		c.DdApiKey = other.DdApiKey
	}
	if other.DoRegion != "" {
		c.DoRegion = other.DoRegion
	}
	if other.DoSize != "" {
		c.DoSize = other.DoSize
	}
}

var (
	configFile string

	url             string
	resetDb         bool
	dbUri           string
	loadLevels      controller.LoadLevels
	stepSize        time.Duration
	classSize       int
	preparedPortion float64
	remote          bool
	doApiKey        string
	ddApiKey        string
	doRegion        string
	doSize          string
)

func init() {
	flag.StringVar(&configFile, "config", "", "Path to a json config file.")

	flag.StringVar(&url, "url", "https://beta.pearup.de", "The URL to the system under test.")
	flag.BoolVar(&resetDb, "resetDb", true, "Whether or not to reset the mongo instance.")
	flag.StringVar(&dbUri, "dbUri", "", "The URI to the mongo instance.")
	flag.Var(&loadLevels, "loadLevels", "A comma-separated list of class concurrencies.")
	flag.DurationVar(&stepSize, "stepSize", 15*time.Minute, "time between each step of the load curve.")
	flag.IntVar(&classSize, "classSize", 30, "The number of pupils within a class.")
	flag.Float64Var(&preparedPortion, "preparedPortion", 0.3, "The portion of classes for which accounts should be created beforehand.")
	flag.BoolVar(&remote, "remote", true, "Whether to provision remote machines to run the tests. If false, they will be run locally.")
	flag.StringVar(&doApiKey, "doApiKey", "", "The API key for digital ocean.")
	flag.StringVar(&ddApiKey, "ddApiKey", "", "The API key for datadog.")
	flag.StringVar(&doRegion, "doRegion", "fra1", "The region to provision the runner instances in.")
	flag.StringVar(&doSize, "doSize", "m-2vcpu-16gb", "The size of the runner instances to provision.")

	flag.Parse()
}

func defaultConfig() *Config {
	return &Config{
		DoRegion: "fra1",
		DoSize:   "m-2vcpu-16gb",
	}
}

func parseConfigFile(path string) *Config {
	if path == "" {
		return &Config{}
	}

	var c Config
	b, err := ioutil.ReadFile(path)
	if err != nil {
		log.Fatalln("Couldn't read config file", err)
	}
	if err = json.Unmarshal(b, &c); err != nil {
		log.Fatalln("Couldn't parse config file", err)
	}

	return &c
}

// TODO: implement rest
func parseEnvVars() *Config {
	c := &Config{}

	if dbUri, ok := os.LookupEnv("DB_URI"); ok {
		c.DbUri = dbUri
	}
	if doApiKey, ok := os.LookupEnv("DO_API_KEY"); ok {
		c.DoApiKey = doApiKey
	}
	if ddApiKey, ok := os.LookupEnv("DD_API_KEY"); ok {
		c.DdApiKey = ddApiKey
	}

	return c
}

func parseFlags() *Config {
	c := &Config{}

	return c
}

func validate(c *Config) {

}
