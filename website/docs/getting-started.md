---
title: Getting Started
sidebar_position: 2
---

# Getting Started

Eventual is a set of NPM packages and a CDK Construct that helps you build microservices and provision corresponding AWS resources.

## 0. Pre-requisites

Before getting started with Eventual, you'll need:

- [Node JS 16+](https://nodejs.org/en/)
- NPM 7+ or Yarn 1+ or PNPM
- An [AWS Account](https://aws.amazon.com/)

## 1. Create a new project

To create a new Eventual project, run:

```
npm create eventual my-eventual-app
```

## 2. Choose your preferred IaC platform

Eventual currently supports two IaC platforms: AWS CDK and AWS SST. You'll be prompted to choose between them when you create a new project. Select [`aws-cdk`](https://docs.aws.amazon.com/cdk/v2/guide/home.html) or [`aws-sst`](https://docs.sst.dev) as appropriate.

```
? target: (Use arrow keys)
❯ aws-cdk
  aws-sst
```

## 3. Deploy the application

Use the `deploy` script to deploy your application to AWS.

```
npm run deploy
```

## 4. List services in your AWS account

After deploying, let's now list the Eventual services we just deployed to our AWS account:

```ts
> npx eventual services
my-service
```

As you can see, we have a single service, `my-service` that was just deployed.

## 5. List workflows

To list the workflows available in our new service, use the `eventual workflows` command. For example:

```ts
> npx eventual workflows
myWorkflow
```

> If you have multiple services deployed, use the `--service` flag to select a service. `npx eventual workflows --service my-service`

## 6. List the endpoints

To view the API Gateway URL and Event Bus ARN for a service, use the `eventual info` command:

```ts
> npx eventual info
API Gateway: 	  https://<uuid>.execute-api.us-west-2.amazonaws.com
Event Bus ARN:  arn:aws:events:us-west-2:<account-id>:event-bus/my-service
```

## 7. Make an API HTTP request

Use a tool like `curl` to make an HTTP request to the API Gateway endpoint for the `/work` API. This will trigger a workflow execution:

```
> curl -X POST https://<uuid>.execute-api.us-west-2.amazonaws.com/work\
  -d '["item1", "item2"]'\
  -H 'Content-Type: application/json'
```

This will return a JSON object containing the execution ID for the triggered workflow execution.

```json
{ "executionId": "<execution-id>" }
```

## 8. Get the logs for the execution

To view the logs for the workflow execution we just started, use the `eventual logs` command followed by the `--execution` flag and the execution ID:

```
> npx eventual logs --execution <execution-id>
```

## 9. Tail the logs of the execution

You could instead choose to tail the logs by appending the `--tail` argument:

```
> npx eventual logs --execution <execution-id> --tail
```

## 10. Destroy the application

To clean up, destroy the application:

- For CDK Users: `npx cdk destroy`.
- For SST Users: `npx sst destroy`.

## Next Steps

Now that you have a basic understanding of Eventual's concepts, you can continue learning by:

- Reading the [Reference Docs](./guide/service.md) for a more in-depth understanding of Eventual's components and how to use them.
- Checking out the [cheat sheet](./cheatsheet.md) for an overview of patterns you can apply to your own projects.
- Doing the [Bank Account Tutorial](./tutorial/bank-account.md) to practice using Eventual in a real-world scenario.
- Exploring the project template for your chosen infrastructure-as-code (IaC) platform: [AWS Cloud Development Kit (CDK)](./overview/aws-cdk.md) or [AWS SST](./overview/aws-sst.md).
