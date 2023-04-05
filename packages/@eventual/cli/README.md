# Eventual cli

For the complete documentation, see: https://docs.eventual.ai/guide/cli

## List workflows

```sh
$ eventual list workflows
```

## Start a workflow (asynchronous)

```sh
$ # Input file should be a json file.
$ eventual start workflow <workflow> [<input> | --inputFile filePath]
```

```sh
$ eventual start workflow <workflow> '{"foo": "bar"}'
```

Provide input as a json string

```sh
$ eventual start workflow <workflow> <<< cat json-string
```

If no input is provided, it is read from stdin

## Start a workflow (follow)

```sh
$ eventual start workflow <workflow> --follow [<input> | --inputFile filePath]
```

## Get execution history

```sh
$ eventual get history --execution <execution>
```

## List executions

```sh
$ eventual list executions [--workflow workflow]

```

## Display logs

```sh
$ eventual get logs [--workflow workflowName | --execution executionId] [--follow] [--since timestamp]

Default shows all logs for a service. Provide workflow or execution to filter respectively.
```

## Replay event history

````sh
$ eventual replay execution <executionId> --entry <entryFile>

eg.

```shell
$ pnpm eventual replay execution my-workflow/01GJQ1WH741VB5ZYZ079RRJF4X --entry ../test-app-runtime/src/my-workflow.ts
````
