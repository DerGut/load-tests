package accounts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"sort"
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

var ErrWrongDumpSize = errors.New("current dump has a different size than requested")

func Generate(classConcurrency, classSize int, preparedPortion float64) error {
	accounts := make([]Classroom, classConcurrency)
	numToPrepare := NumPrepared(classConcurrency, preparedPortion)
	for i := 0; i < classConcurrency; i++ {
		prepare := i < numToPrepare
		accounts[i] = buildClassroom(classSize, i, prepare)
	}

	b, err := json.MarshalIndent(&accounts, "", "  ")
	if err != nil {
		panic(fmt.Errorf("failed to marshal accounts %v", err))
	}
	return ioutil.WriteFile(accountsFile, b, os.ModePerm)
}

func NumPrepared(classConcurrency int, preparedPortion float64) int {
	return int(float64(classConcurrency) * preparedPortion)
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
			Company:  fmt.Sprintf("company%dt%d", classId+1, i+1),
		}
	}

	return p
}

func Get(classConcurrency, classSize int, preparedPortion float64) ([]Classroom, error) {
	dump, err := Read()
	if err != nil {
		return nil, err
	}

	if len(dump) < classConcurrency {
		return nil, fmt.Errorf("not enough classes: %w", ErrWrongDumpSize)
	}

	accounts, err := sizeDump(dump, classConcurrency, preparedPortion)
	if err != nil {
		return nil, err
	}

	for _, a := range accounts {
		if len(a.Pupils) != classSize {
			return nil, fmt.Errorf("not enough pupils per class: %w", ErrWrongDumpSize)
		}
	}

	return dump, nil
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

func sizeDump(dump []Classroom, classConcurrency int, preparedPortion float64) ([]Classroom, error) {
	numPreparedWanted := NumPrepared(classConcurrency, preparedPortion)

	// Sort accounts from prepared to unprepared
	sort.Slice(dump, func(i, j int) bool {
		return dump[i].Prepared && !dump[j].Prepared
	})

	var accounts []Classroom
	for i := 0; i < classConcurrency; i++ {
		if i < numPreparedWanted && !dump[i].Prepared {
			return nil, fmt.Errorf("not enough prepared accounts in dump: %w", ErrWrongDumpSize)
		}
		if i >= numPreparedWanted && dump[i].Prepared {
			continue
		}
		accounts = append(accounts, dump[i])
	}

	return accounts, nil
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
	Company  string `json:"company"`
}
