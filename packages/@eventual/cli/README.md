# Eventual cli

## List workflows

```shell
$ eventual workflows list
```

## Start a workflow (asynchronous)

```shell
$ eventual executions new --workflow <name> --input [input-json]
```

Input should be a json string. If it is an array, each item in the array will be passed to the function as a seperate parameter.

Alternatively, use `--input-file` to provide a json file for input

## Start a workflow (tail)

```shell
$ eventual executions new --tail --workflow <name> --input [input-json]
```

## Get execution events

```shell
$ eventual executions events --workflow <name>
```

## List workflow executions

```shell
$ eventual executions list --workflow <name> --execution <id>
```
