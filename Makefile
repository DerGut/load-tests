run-local: build-controller build-runner
	./main --dbUri=${MONGO_URI} --loadLevels=1 --stepSize=15m --classSize=5 --preparedPortion=0.3 --remote=false

run-remote: build-controller
	./main --config config-remote.json

build-controller:
	go build cmd/main.go

build-runner: install-runner-build-deps
	npm run build --prefix loadrunner/

install-runner-build-deps:
	npm install --prefix loadrunner/

accounts-reset:
	mongorestore --drop --uri=${MONGO_URI} --archive=accounts/data/dump --nsFrom=meteor.* --nsTo=pearup.*
