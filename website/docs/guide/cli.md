---
sidebar_position: 7
---

# CLI

The Eventual CLI, available in `@eventual/cli`, provides a Command Line Interface for interacting with Services deployed with Eventual.

## Installation

```
npm install --save-dev @eventual/cli
```

## Commands

### `execution`

The `execution` command gets information about an execution id. It takes a single positional argument of the execution's ID and prints information

```
eventual execution <execution-id>
```

### `executions`

### `history`

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

```
eventual configure                        Get data about an execution
eventual execution <execution>            Get data about an execution
eventual executions                       List executions of a service, or opt
                                          ionally, a workflow
eventual history <execution>              Get execution history
eventual logs                             Get logs for a given service, option
                                          ally filtered by a given workflow or
                                            execution
eventual events <event>                   Send one or more events to the servi
                                          ce
eventual replay <execution> <entry>       List executions of a workflow
eventual send-signal <execution> <signal  Send a signal to a running execution
> [payloadFile]
eventual services                         List Eventual services
eventual start <workflow> [inputFile]     Start an execution
eventual timeline <execution>             Visualise execution history
eventual workflows                        List workflows of a service
eventual completion                       generate completion script
```
