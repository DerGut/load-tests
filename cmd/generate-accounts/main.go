package main

import (
	"log"
	"os"
	"strconv"

	"github.com/DerGut/load-tests/accounts"
)

const usage = "Run as: \n\t./accounts maxConcurreny classSize preparedPortion\n\nwhere maxConcurrency and classSize are integers and preparedPortion is a floating point number."

func main() {
	if len(os.Args) < 4 {
		log.Fatalln(usage)
	}

	maxConcurrency, err := strconv.Atoi(os.Args[1])
	if err != nil {
		log.Fatalln(usage, err)
	}
	classSize, err := strconv.Atoi(os.Args[2])
	if err != nil {
		log.Fatalln(usage, err)
	}
	preparedPortion, err := strconv.ParseFloat(os.Args[3], 64)
	if err != nil {
		log.Fatalln(usage, err)
	}

	log.Println("Generating new accounts file", maxConcurrency, classSize, preparedPortion)
	if err := accounts.Generate(maxConcurrency, classSize, preparedPortion); err != nil {
		log.Fatalln("Failed to generate accounts file", err)
	}

	log.Println("A new accounts file has been created. Please create a mongodb dump from it by running the local Meteor server")
}
