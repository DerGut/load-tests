package controller

import (
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

type LoadCurve struct {
	LoadLevels
	StepSize time.Duration
	C        chan int
	done     chan struct{}
}

func NewLoadCurve(levels LoadLevels, stepSize time.Duration) *LoadCurve {
	return &LoadCurve{
		levels,
		stepSize,
		make(chan int),
		make(chan struct{}),
	}
}

type LoadLevels []int

func (lc LoadCurve) Start() {
	go func() {
		lc.C <- lc.LoadLevels[0]
		log.Println("Waiting for ", lc.StepSize, " until next increment")
		t := time.NewTicker(lc.StepSize)
		for i := 1; i <= len(lc.LoadLevels); i++ {
			select {
			case <-t.C:
				if i == len(lc.LoadLevels) {
					close(lc.C)
					return
				}
				lc.C <- lc.LoadLevels[i]
			case <-lc.done:
				t.Stop()
				return
			}
		}
	}()
}

func (lc LoadCurve) Stop() {
	lc.done <- struct{}{}
}

func (ll *LoadLevels) Set(flag string) error {
	vals := strings.Split(flag, ",")
	if len(vals) < 1 {
		return errors.New("loadLevels shoud have at least one value")
	}

	for i, v := range vals {
		load, err := strconv.Atoi(v)
		if err != nil {
			return fmt.Errorf("failed to parse %s at position %d", v, i)
		}
		*ll = append(*ll, load)
	}

	return nil
}

func (ll *LoadLevels) String() string {
	return fmt.Sprint(*ll)
}
