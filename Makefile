run-local: build-controller build-runner
	./main --config config-local.json --doApiKey=""

run-remote: build-controller
	./main --config config-remote.json

run-runner-only: build-runner
	node --inspect loadrunner/built/main.js test-run https://beta.pearup.de/ local-test-accounts-small.json

build-controller:
	go build cmd/main.go

build-runner: install-runner-build-deps
	npm run build --prefix loadrunner/

install-runner-build-deps:
	npm install --prefix loadrunner/

accounts-reset:
	mongorestore --drop --uri=${DB_URI} --archive=accounts/data/dump --nsFrom=meteor.* --nsTo=pearup.*
