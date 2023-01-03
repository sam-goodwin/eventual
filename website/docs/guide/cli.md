---
sidebar_position: 7
---

# CLI

The Eventual CLI, available in `@eventual/cli`, provides a Command Line Interface for interacting with Services deployed with Eventual.

## Installation

```
npm install --save-dev @eventual/cli
```

## AWS Profile

The Eventual CLI uses the current AWS Profile and credentials in your environment. Optionally, it will listen to AWS Environment variables to override the current settings.

```sh
AWS_PROFILE=[our profile] eventual info
```

## Service Selection

If the account for the current AWS Profile has a single service deployed to it, the CLI will infer the service name to use for all applicable commands.

If the account has more than one service deployed to it, a service name must be provided:

- by providing the `--service` flag on any command that requires a service name. `eventual workflows --service myService`. To see what service names are available, use `eventual services`.
- by setting the `EVENTUAL_DEFAULT_SERVICE` environment variable.

## Commands

```
  eventual configure    Get Eventual CLI configuration
  eventual execution    Get data about an execution
  eventual executions   List executions of a service, or optionally, a workflow
  eventual history      Get execution history
  eventual logs         Get logs for a given service, optionally filtered by a given workflow or execution
  eventual publish-events       Send one or more events to the service
  eventual replay       Replays a workflow from the events of another execution
  eventual send-signal  Send a signal to a running execution
  eventual info         Get data about your service
  eventual services     List Eventual services
  eventual start        Start an execution
  eventual timeline     Visualize execution history
  eventual workflows    List workflows of a service
```

### `execution`

The `execution` command gets information about an execution id. It takes an `--execition` id and prints information including the status and result if complete.

```sh
eventual execution --execution myExecutionId
```

### `executions`

The `executions` command fetches ongoing or completed executions. It can be filtered by `--workflow`. It prints information about executions given the filters.

```sh
eventual executions --workflow myWorkflow
```

### `history`

The `history` command fetches granular history data for an execution.

```sh
eventual history --execution myExecutionId
```

### `info`

The `info` command prints out important information about your service like the api endpoint (used to access the service from other services) and
the event bus arn to send events to this service.

```sh
eventual info
```

### `logs`

Retrieves service logs for a given service. Filter by a workflow or execution.

```sh
eventual logs
eventual logs --workflow myWorkflow
eventual logs --execution myExecutionId
```

### `events`

Publishes events to the service.

```sh
eventual publish-events --event <eventId> --payload '{ someJson: "value" }'
eventual publish-events --event <eventId> --payloadFile "path/to/file.json"
eventual publish-events --event <eventId>  <<< cat "path/to/file.json"
```

### `replay`

Replays a workflow from the events of another execution.

```sh
eventual replay --execution myExecutionId --entry <path to .js or .ts service file>
```

This command can be used in combination with vscode's debug terminal to debug a workflow from a previous workflow execution.

In VSCode:

1. [cmd/ctrl-shift-P] debug terminal
2. add breakpoints to your workflow code
3. `eventual replay --execution <executionId> --entry <path to .js or .ts service file>`

### `send-signal`

Sends a signal to a running execution.

```sh
eventual send-signal --signal mySignal --execution myExecutionId --payload '{ someJson: "value" }'
eventual send-signal --signal mySignal --execution myExecutionId --payloadFile "path/to/file.json"
eventual send-signal --signal mySignal --execution myExecutionId <<< cat "path/to/file.json"
```

### `services`

Lists all services in the current AWS account.

```sh
eventual services
```

### `start`

Starts a workflow execution.

```sh
eventual start --workflow myWorkflow --input '{ myValue: "value" }'
eventual start --workflow myWorkflow --inputFile "path/to/file.json"
eventual start --workflow myWorkflow <<< cat "path/to/file.json"
```

Use `--tail` to watch a workflow while it runs.

```sh
eventual start --workflow myWorkflow --tail
```

### `timeline`

Launches a timeline UI showing events in the workflow execution while running or on completion.

```sh
eventual timeline --execution myExecutionId
```

### `workflows`

Lists the workflows in a service.

```sh
eventual workflows
```

### `configure list`

Lists current environment configurations.

```sh
$ eventual configure list
┌────────────────────┬────────────────────┬──────────────────────────────────────────────────┬────────────────────┐
│ Property           │ Env                │ Description                                      │ Value              │
├────────────────────┼────────────────────┼──────────────────────────────────────────────────┼────────────────────┤
│ default-service    │ EVENTUAL_DEFAULT_… │ Default Service used for eventual commands when  │                    │
│                    │                    │ --service is not provided.                       │                    │
└────────────────────┴────────────────────┴──────────────────────────────────────────────────┴────────────────────┘
```

> Use EVENTUAL_DEFAULT_SERVICE to set a default service when there are multiple in the current AWS account.
