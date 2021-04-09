package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type LoadCurve struct {
	LoadLevels
	StepSize
}

type LoadLevels []int
type StepSize struct {
	time.Duration
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

func (ss *StepSize) MarshalJSON() ([]byte, error) {
	return json.Marshal(ss.String())
}

func (ss *StepSize) UnmarshalJSON(b []byte) error {
	var s string
	err := json.Unmarshal(b, &s)
	if err != nil {
		return err
	}

	d, err := time.ParseDuration(s)
	if err != nil {
		return err
	}
	ss.Duration = d
	return nil
}
