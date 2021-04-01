package accounts

import (
	"context"
	"encoding/json"
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

func Generate(classConcurrency, classSize int, preparedPortion float32) error {
	accounts := make([]Classroom, classConcurrency)
	for i := 0; i < classConcurrency; i++ {
		prepare := i < int(float32(classConcurrency)*preparedPortion)
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
