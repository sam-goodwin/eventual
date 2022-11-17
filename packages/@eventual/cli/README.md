# Eventual cli

## List workflows

```shell
$ eventual workflows list
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
$ eventual history <name> <execution>
```

## List workflow executions

```shell
$ eventual executions <name> [--sort sortKey]
```
