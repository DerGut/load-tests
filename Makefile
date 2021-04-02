run-local: build-controller build-runner
	./main --dbUri=${MONGO_URI} --loadLevels=1 --stepSize=15m --classSize=1 --preparedPortion=0.3 --remote=false

build-controller:
	go build cmd/main.go

build-runner: install-runner-build-deps
	loadrunner/node_modules/typescript/bin/tsc --project loadrunner/

install-runner-build-deps:
	npm install --prefix loadrunner/
