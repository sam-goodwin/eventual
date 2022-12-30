# Getting Started

Eventual is a set of NPM packages and a CDK Construct that helps you build microservices and provision corresponding AWS resources.

## 0. Pre-requisites

Before getting started with Eventual, you'll need:

- [Node JS 16+](https://nodejs.org/en/)
- An [AWS Account](https://aws.amazon.com/)

## 1. Create a new project

To create a new Eventual project, run:

```
npm create eventual my-eventual-app
```

## 2. Choose your preferred IaC platform

Eventual supports two IaC platforms: AWS CDK and AWS SST. You'll be prompted to choose between them when you create a new project. Select `aws-cdk` or `aws-sst` as appropriate.

```
? target: (Use arrow keys)
❯ aws-cdk
  aws-sst
```

## 3. Deploy

To deploy your Eventual project, run the appropriate command for your chosen IaC platform:

- For CDK: `npx cdk deploy`
- For SST: `npx sst deploy`

## 4. List services

After deploying, let's now list the Eventual services we just deployed to our AWS account:

```ts
> npx eventual services
my-service
```

As you can see, we have a single service, `my-service` that was just deployed.

## 5. List workflows in my-service

Next, list the workflows that are available in the `my-service` service:

```ts
> npx eventual workflows my-service
myWorkflow
```

## 6. List the endpoints in my-service

```ts
> npx eventual my-service
API Gateway: 	  https://<uuid>.execute-api.us-west-2.amazonaws.com
Event Bus ARN:  arn:aws:events:us-west-2:<account-id>:event-bus/my-service
```

## 7. Make an API HTTP request

```
> curl -X POST https://<uuid>.execute-api.us-west-2.amazonaws.com/work\
  -d '["item1", "item2"]'\
  -H 'Content-Type: application/json'
{"executionId": "<execution-id>"}
```

## 8. Get the logs for the execution

```
> npx eventual logs --execution <execution-id>
```

## X. Next Steps

Once you've deployed your Eventual project, you can proceed to the corresponding documentation for your chosen IaC platform:

1. [AWS Cloud Development Kit (CDK)](./2-aws-cdk.md) - an AWS developer experience
2. [AWS SST](./1-aws-sst.md) - an AWS developer experience optimized for serverless
