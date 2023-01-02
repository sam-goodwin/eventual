# Eventual cli

## List workflows

```shell
$ eventual workflows
```

## Start a workflow (asynchronous)

```shell
$ eventual start <workflow> [inputFile]
Input file should be a json file.
```

```shell
$ eventual start <workflow> --input '{"foo": "bar"}'
```

Provide input as a json string

```shell
$ eventual start <workflow> <<< cat json-string
```

If no input is provided, it is read from stdin

## Start a workflow (tail)

```shell
$ eventual start --tail <workflow> [input]
```

## Get execution history

```shell
$ eventual history <execution>
```

## List executions

```shell
$ eventual executions [--workflow workflow]

```

## Display logs

```shell
$ eventual logs [--workflow workflowName | --execution executionId] [--tail] [--since timestamp]

Default shows all logs for a service. Provide workflow or execution to filter respectively.
```

## Replay event history

````shell
$ eventual replay <executionId> <entryFile>

eg.

```shell
$ pnpm eventual replay my-service my-workflow/01GJQ1WH741VB5ZYZ079RRJF4X ../test-app-runtime/src/my-workflow.ts
````
