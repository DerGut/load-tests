# LoadRunner

## Arguments
The loadrunner requires three arguments to run. They can be provided via environment variables or positional command line parameters. If both are provided, command line parameters overwrite the environment variables. However only one of the parameterization types can be used.

| Environment Variables | Position | Description |
|-|-|-|
| `RUN_ID` | `1` | The ID of the test run. It will be used for tagging metrics and logs. |
| `URL` | `2` | The url of the system under test. |
| `ACCOUNTS` | `3` | JSON encoded account information for the test users. |