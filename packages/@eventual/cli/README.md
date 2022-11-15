# Eventual cli

## List workflows

```shell
$ eventual workflows list
```

## Start a workflow (asynchronous)

```shell
$ eventual executions new --workflow <name> --parameters [...parameters]
```

Parameters is variadic, and will be forwarded as multiple parameters to the workflow handler

## Start a workflow (tail)

```shell
$ eventual executions new --tail --workflow <name> --parameters [...parameters]
```

## Get execution events

```shell
$ eventual executions events --workflow <name>
```

## List workflow executions

```shell
$ eventual executions list --workflow <name> --execution <id>
```
