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

// Config captures all configuration provided by a config file,
// env vars and command line args. Parameters provided via env vars
// overwrite those provided by a file. Parameters provided via command
// line args overwrite both.
// This is with the exception of the boolean variables NoReset and Local.
// A true value always wins in that case.
type Config struct {
	Url string `json:"url"`

	NoReset bool   `json:"noReset"`
	DbUri   string `json:"dbUri"`

	LoadLevels      controller.LoadLevels `json:"loadLevels"`
	StepSize        controller.StepSize   `json:"stepSize"`
	ClassSize       int                   `json:"classSize"`
	PreparedPortion float64               `json:"preparedPortion"`

	Local            bool   `json:"local"`
	ClassesPerRunner int    `json:"classesPerRunner"`
	DdApiKey         string `json:"ddApiKey"`
	DoApiKey         string `json:"doApiKey"`
	DoRegion         string `json:"doRegion"`
	DoSize           string `json:"doSize"`
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

	c.NoReset = c.NoReset || other.NoReset
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

	c.Local = c.Local || other.Local
	if other.ClassesPerRunner > 0 {
		c.ClassesPerRunner = other.ClassesPerRunner
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

	url string

	noReset         bool
	dbUri           string
	loadLevels      controller.LoadLevels
	stepSize        time.Duration
	classSize       int
	preparedPortion float64

	local            bool
	classesPerRunner int
	doApiKey         string
	ddApiKey         string
	doRegion         string
	doSize           string
)

func init() {
	flag.StringVar(&configFile, "config", "", "Path to a json config file.")

	flag.StringVar(&url, "url", "", "The URL to the system under test.")

	flag.BoolVar(&noReset, "noReset", false, "Whether to skip the reset of the mongo instance.")
	flag.StringVar(&dbUri, "dbUri", "", "The URI to the mongo instance.")

	flag.Var(&loadLevels, "loadLevels", "A comma-separated list of class concurrencies.")
	flag.DurationVar(&stepSize, "stepSize", 0, "time between each step of the load curve.")
	flag.IntVar(&classSize, "classSize", 0, "The number of pupils within a class.")
	flag.Float64Var(&preparedPortion, "preparedPortion", 0, "The portion of classes for which accounts should be created beforehand.")

	flag.BoolVar(&local, "local", false, "If true, the tests will be run locally.")
	flag.IntVar(&classesPerRunner, "classesPerRunner", 0, "The number of classes managed by a single runner instance.")
	flag.StringVar(&doApiKey, "doApiKey", "", "The API key for digital ocean.")
	flag.StringVar(&ddApiKey, "ddApiKey", "", "The API key for datadog.")
	flag.StringVar(&doRegion, "doRegion", "", "The region to provision the runner instances in.")
	flag.StringVar(&doSize, "doSize", "", "The size of the runner instances to provision.")

	flag.Parse()
}

func defaultConfig() *Config {
	return &Config{
		ClassesPerRunner: 1,
		DoRegion:         "fra1",
		DoSize:           "s-2vcpu-8gb",
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
	c := &Config{
		Url: url,

		NoReset:         noReset,
		DbUri:           dbUri,
		LoadLevels:      loadLevels,
		StepSize:        controller.StepSize{Duration: stepSize},
		ClassSize:       classSize,
		PreparedPortion: preparedPortion,

		Local:            local,
		ClassesPerRunner: classesPerRunner,
		DoApiKey:         doApiKey,
		DdApiKey:         ddApiKey,
		DoRegion:         doRegion,
		DoSize:           doSize,
	}

	return c
}

func validate(c *Config) {

}
