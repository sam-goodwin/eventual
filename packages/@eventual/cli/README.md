# Eventual cli

## List workflows

```shell
$ eventual workflows
```

## Start a workflow (asynchronous)

```shell
$ eventual start --workflow <workflow> [--input input | --inputFile filePath]
Input file should be a json file.
```

```shell
$ eventual start --workflow <workflow> --input '{"foo": "bar"}'
```

Provide input as a json string

```shell
$ eventual start --workflow <workflow> <<< cat json-string
```

If no input is provided, it is read from stdin

## Start a workflow (follow)

```shell
$ eventual start --follow --workflow <workflow> [--input input | --inputFile filePath]
```

## Get execution history

```shell
$ eventual history --execution <execution>
```

## List executions

```shell
$ eventual executions [--workflow workflow]

```

## Display logs

```shell
$ eventual logs [--workflow workflowName | --execution executionId] [--follow] [--since timestamp]

Default shows all logs for a service. Provide workflow or execution to filter respectively.
```

## Replay event history

````shell
$ eventual replay --execution <executionId> --entry <entryFile>

eg.

```shell
$ pnpm eventual replay --execution my-workflow/01GJQ1WH741VB5ZYZ079RRJF4X --entry ../test-app-runtime/src/my-workflow.ts
````
