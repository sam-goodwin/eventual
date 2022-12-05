# Eventual cli

## List workflows

```shell
$ eventual workflows list
```

## Start a workflow (asynchronous)

```shell
$ eventual start <service> <workflow> [inputFile]
Input file should be a json file.
```

```shell
$ eventual start <service> <workflow> --input '{"foo": "bar"}'
```

Provide input as a json string

```shell
$ eventual start <service> <workflow> <<< cat json-string
```

If no input is provided, it is read from stdin

## Start a workflow (tail)

```shell
$ eventual start --tail <service> <workflow> [input]
```

## Get execution history

```shell
$ eventual history <service> <execution>
```

## List executions

```shell
$ eventual executions <service> [--workflow workflow] [--sort sortKey]

```

## Display logs

```shell
$ eventual logs <service> [--workflow workflowName | --execution executionId] [--tail] [--since timestamp]

Default shows all logs for a service. Provide workflow or execution to filter respectively.
```

## Replay event history

````shell
$ eventual replay <service> <executionId> <entryFile>

eg.

```shell
$ pnpm eventual replay my-service my-workflow/01GJQ1WH741VB5ZYZ079RRJF4X ../test-app-runtime/src/my-workflow.ts
````
