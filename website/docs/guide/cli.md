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
  eventual events       Send one or more events to the service
  eventual replay       List executions of a workflow
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
eventual execution --execution <execution-id>
```

### `executions`

The `executions` command fetches ongoing or completed executions. It can be filtered by `--workflow`. It prints information about executions given the filters.

```sh
eventual executions --workflow <workflow>
```

### `history`

The `history` command fetches granular history data from the workflow.

```sh
eventual executions --workflow <workflow>
```

### `info`

### `logs`

### `events`

### `replay`

### `send-signal`

### `services`

### `start`

### `timeline`

### `workflows`

### `completion`

### `configure`
