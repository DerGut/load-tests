run-local: build-controller build-runner
	./loadctl --config config-local.json --dbUri "mongodb://localhost:3001"

run-remote: build-controller
	./loadctl --config config-remote.json

run-runner-only: build-runner
	node --inspect loadrunner/built/main.js test-run https://beta.pearup.de/ local-test-accounts-small.json

build-controller:
	go build ./cmd/loadctl/

build-runner: install-runner-build-deps
	npm run build --prefix loadrunner/

install-runner-build-deps:
	npm install --prefix loadrunner/

accounts-reset:
	mongorestore --drop --uri=${DB_URI} --archive=accounts/data/dump --nsFrom=meteor.* --nsTo=pearup.*

accounts-generate: accounts-build
	./generate-accounts 56 30 0.3

accounts-build:
	go build ./cmd/generate-accounts
