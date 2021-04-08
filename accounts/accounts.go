package accounts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
)

const (
	// DefaultDumpFile is path to the mongodb dump to restore
	DefaultDumpFile = "accounts/data/dump"

	defaultClassName = "TestKlasse"
	defaultPassword  = "Passwort123!"
	accountsFile     = "accounts/data/accounts.json"
	nsFrom           = "meteor.*"
	nsTo             = "pearup.*"
)

var ErrDumpTooSmall = errors.New("not enough accounts in dump")

func Generate(classConcurrency, classSize int, preparedPortion float64) error {
	accounts := make([]Classroom, classConcurrency)
	for i := 0; i < classConcurrency; i++ {
		prepare := i < int(float64(classConcurrency)*preparedPortion)
		accounts[i] = buildClassroom(classSize, i, prepare)
	}

	b, err := json.MarshalIndent(&accounts, "", "  ")
	if err != nil {
		panic(fmt.Errorf("failed to marshal accounts %v", err))
	}
	return ioutil.WriteFile(accountsFile, b, os.ModePerm)
}

func buildClassroom(classSize, classId int, isPrepared bool) Classroom {
	return Classroom{
		Prepared: isPrepared,
		Name:     defaultClassName,
		Teacher: Teacher{
			Email:    fmt.Sprintf("teacher-%d@load-test.com", classId+1),
			Password: defaultPassword,
		},
		Pupils: buildPupils(classSize, classId),
	}
}

func buildPupils(number, classId int) []Pupil {
	p := make([]Pupil, number)
	for i := 0; i < number; i++ {
		p[i] = Pupil{
			Username: fmt.Sprintf("pupil%dt%d", classId+1, i+1),
			Password: defaultPassword,
		}
	}

	return p
}

func Get(classes, size int) ([]Classroom, error) {
	accounts, err := Read()
	if err != nil {
		return nil, err
	}

	if len(accounts) < classes {
		return nil, fmt.Errorf("not enough classes: %w", ErrDumpTooSmall)
	}

	accounts = accounts[:classes]
	for i, a := range accounts {
		if len(a.Pupils) < size {
			return nil, fmt.Errorf("not enough pupils per class: %w", ErrDumpTooSmall)
		}
		accounts[i].Pupils = a.Pupils[:size]
	}

	return accounts, nil
}

func Read() ([]Classroom, error) {
	b, err := ioutil.ReadFile(accountsFile)
	if err != nil {
		return nil, err
	}

	var c []Classroom
	err = json.Unmarshal(b, &c)
	if err != nil {
		panic(err)
	}

	return c, err
}

func Restore(ctx context.Context, dbUri string, archivePath string) error {
	cmd := exec.CommandContext(
		ctx,
		"mongorestore",
		"--drop",
		"--uri="+dbUri,
		"--archive="+archivePath,
		"--nsFrom="+nsFrom,
		"--nsTo="+nsTo,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

type Classroom struct {
	Prepared bool   `json:"prepared"`
	Name     string `json:"name"`
	Teacher  `json:"teacher"`
	Pupils   []Pupil `json:"pupils"`
}

type Teacher struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type Pupil struct {
	Username string `json:"username"`
	Password string `json:"password"`
}
