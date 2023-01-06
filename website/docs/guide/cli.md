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

The AWS Profile is used by the Eventual CLI to authenticate and authorize your access to AWS resources. By default, it uses the current AWS profile and credentials in your environment. However, you can also specify a different AWS profile by setting the `AWS_PROFILE` environment variable before running the commands. For example:

```sh
AWS_PROFILE=[your profile] eventual get service
```

## Service Selection

The Eventual CLI allows you to specify which service to use for commands that require a service name. If your AWS account has multiple services deployed, you will need to specify which service to use. There are two ways to do this:

- Use the `--service` flag when running a command that requires a service name. For example: `eventual list workflows --service myService`. You can see a list of available service names by running `eventual list services`.
- Set the `EVENTUAL_DEFAULT_SERVICE` environment variable to specify the default service to use. This will be used for all applicable commands unless overridden with the `--service` flag.

## Commands

```sh
eventual list     List executions, workflows, or services.
eventual get      Get or show an execution, service, timeline, history, logs,
                    or the cli configuration.                    [aliases: show]
eventual send     Send signals
eventual publish  Publish events
eventual replay   Replay executions
eventual start    Start a workflow
```

### `list`

```sh
eventual list executions  List executions of a service, or optionally, a workf
                            low
eventual list workflows   List workflows of a service
eventual list services    List Eventual services
```

#### `executions`

The `list executions` command retrieves a list of ongoing or completed workflow executions based on the specified filters. It takes an optional `--workflow` flag, which can be used to filter the results by the name of the workflow.

For example, to retrieve a list of all executions of the `myWorkflow` workflow, you can use the following command:

```sh
eventual list executions --workflow myWorkflow
```

#### `services`

The `services` command is an easy way to view all of the services that are deployed in your AWS account. It provides a list of service names, which can be useful if you have multiple services in your account and need to determine which one you want to use for a particular command.

```sh
eventual list services
```

### `get/show`

```sh
eventual get execution <execution>  Get data about an execution
eventual get history                Get execution history
eventual get logs                   Get logs for a given service, optionally f
                                      iltered by a given workflow or execution
eventual get service [service]      Get data about your service
eventual get config                 Returns all configuration properties and t
                                      heir values       [aliases: configuration]
eventual get timeline               Visualize execution history
```

#### `execution`

The `execution` command retrieves information about a specific workflow execution identified by its `executionId`. When invoked, it prints details about the execution such as its current status and the result if it has completed.

For example, the following command retrieves information about the execution with the ID `myExecutionId`:

```sh
eventual get execution myExecutionId
```

#### `history`

To fetch granular history data for a specific execution, use the `history` command and pass the `--execution` flag with the execution's ID. For example:

```sh
eventual get history --execution myExecutionId
```

This will retrieve a detailed event log for the specified execution, which can be used to view the progress and actions taken within the execution. The log will include information such as the event type, time, and any relevant data.

#### `service`

The `info` command displays key information about your service, including the API endpoint (used to access the service from other services) and the event bus ARN (used to send events to the service). You can use it as follows:

```sh
eventual show service
```

#### `logs`

The `logs` command allows you to retrieve service logs for a specific service. You can filter the logs by specifying a workflow or execution using the `--workflow` or `--execution` flag, respectively. Here's an example of how to use the logs command:

```sh
# Retrieve all logs for the service
eventual get logs

# Retrieve logs for a specific workflow
eventual get logs --workflow myWorkflow

# Retrieve logs for a specific execution
eventual get logs --execution myExecutionId
```

### `publish events`

The `publish events` command allows you to publish events to the service. You can pass the event ID as the 3rd argument flag and specify the event payload as a string or file with the `--payload` flag or `--payloadFile` flag. Alternatively, you can pipe STDIN with the `<<<` operator.

Examples:

```sh
# Publish an event with JSON payload specified in the command line
eventual publish events <eventId> --payload '{ someJson: "value" }'

# Publish an event with JSON payload from a file
eventual publish events <eventId> --payloadFile "path/to/file.json"

# Publish an event with JSON payload from stdin
eventual publish events <eventId>  <<< cat "path/to/file.json"
```

### `replay execution`

The `replay` command allows you to replay an execution locally. This can be useful for debugging purposes, as it allows you to set breakpoints in your workflow code and step through the execution in a debugger.

To use the `replay` command:

1. Specify the `--execution` flag with the ID of the execution you want to replay.
2. Specify the `--entry` flag with the path to your workflow code file (either a `.js` or `.ts` file).
3. (Optional) Use the VSCode debugger terminal to set breakpoints and step through the execution. To do this, open the debugger terminal by pressing cmd/shift-P (mac) or ctrl/shift-P (windows) and selecting "debug terminal", set breakpoints in your workflow code, and run the replay command in the debugger terminal.

Example:

```sh
eventual replay execution myExecutionId --entry ./src/my-service.ts
```

### `send signal`

To send a signal to a running execution, use the send-signal command and specify the signal to send in the 3rd argument, and the execution to send it to using the `--execution` flag. You can also provide an optional payload with the signal with the `--payload` or `--payloadFile` flags, or by piping STDIN.

Here are some examples of how to use the `send signal` command:

```sh
# Send a signal with a JSON payload specified inline
eventual send signal mySignal --execution myExecutionId --payload '{ someJson: "value" }'

# Send a signal with a JSON payload specified in a file
eventual send signal mySignal --execution myExecutionId --payloadFile "path/to/file.json"

# Send a signal with a JSON payload passed in through stdin
eventual send signal mySignal --execution myExecutionId <<< cat "path/to/file.json"
```

### `start workflow`

The `start` command allows you to start a workflow execution. You need to specify the workflow to start using the `--workflow` flag and an optional input with `--input`, `--inputFile` or via STDIN.

```sh
# Start a workflow execution and pass in the input data as an argument to the workflow function
eventual start workflow myWorkflow --input '{ myValue: "value" }'

# Alternatively, you can specify the input data using a file path
eventual start workflow myWorkflow --inputFile "path/to/file.json"

# Or use STDIN redirection to pass in the input data from a file
eventual start workflow myWorkflow <<< cat "path/to/file.json"
```

Use `--follow` to watch a workflow while it runs.

```sh
eventual start workflow myWorkflow --follow
```

### `show timeline`

Launches a timeline UI showing events in the workflow execution while running or on completion.

```sh
eventual show timeline --execution myExecutionId
```

### `list workflows`

To list the `workflows` in a service, you can use the workflows command. It takes no additional arguments and simply prints a list of the workflows in the current service. Here's an example of how to use it:

```sh
eventual list workflows
```

This command is useful for quickly finding the names of the workflows that you can use with other commands, such as start or executions. It can also be used to get a general overview of the workflows in your service.

### `show config`

Shows current environment configurations.

```sh
$ eventual show config
┌────────────────────────────────────────┬──────────────────────────────────────────────────┬────────────────────┐
│ Env                                    │ Description                                      │ Value              │
├────────────────────────────────────────┼──────────────────────────────────────────────────┼────────────────────┤
│ EVENTUAL_DEFAULT_SERVICE               │ Default Service used for eventual commands when  │                    │
│                                        │ --service is not provided.                       │                    │
└────────────────────────────────────────┴──────────────────────────────────────────────────┴────────────────────┘
```

> Use EVENTUAL_DEFAULT_SERVICE to set a default service when there are multiple in the current AWS account.
