<div align="center">
  <a href="https://eventual.net">
    <img src="assets/eventual-logo-image-only.svg" />
  </a>
  <br />
  <h1>Eventual</h1>
  <h3>
  A set of tools for building and deploying microservices in the cloud.
  </h3>
  <a href="https://badge.fury.io/js/@eventual%2Fcore.svg">
    <img src="https://badge.fury.io/js/@eventual%2Fcore.svg" />
  </a>
  <a href="https://github.com/eventual/eventual/blob/main/LICENSE">
    <img alt="MIT License" src="https://img.shields.io/github/license/functionless/eventual" />
  </a>
  <a href="https://discord.gg/VRqHbjrbfC">
    <img alt="Discord" src="https://img.shields.io/discord/985291961885949973?color=7389D8&label&logo=discord&logoColor=ffffff" />
  </a>
  <a href="https://twitter.com/eventual_cloud">
    <img alt="Twitter" src="https://img.shields.io/twitter/url.svg?label=%40eventual_cloud&style=social&url=https%3A%2F%2Ftwitter.com%2Feventual_cloud" />
  </a>
</div>

---

> 🛠&nbsp; Eventual is in pre-release - come chat to us on [Discord](https://discord.gg/VRqHbjrbfC)!

---

## Overview

**[Website](https://eventual.net/) • [API Docs](https://eventual.net/docs/what-is-eventual) • [Getting Started](https://eventual.net/docs/getting-started/setup)**

- 👨‍💻&nbsp; **Code-First** - use the full power of your favorite programing language instead of learning DSLs.
- 🧩&nbsp; **Infrastructure-as-Code** - drops in to any AWS CDK, Pulumi, Terraform CDK or Serverless Framework application.
- 🚀&nbsp; **Purely Serverless** - load-based pricing, scales to $0 and minimal operational complexity.
- 📈&nbsp; **Infinitely Scalable** - no hard limit on the number of concurrently running workflows.
- 🌩&nbsp; **Runs in your AWS account** - transparent billing and total ownership over your data and security boundaries.
- 👮‍♀️&nbsp; **Secure and Compliant** - configurable encryption and auditing all within your own infrastructure.
- 💰&nbsp; **Cost Effective** - X times less cost per workflow step than AWS Step Functions.
- 🔧&nbsp; **Light Weight** - no complicated third-party servers or databases to maintain.

## Quick Start

Quickly start a new project with Eventual or drop-in to an existing AWS CDK, Pulumi or Terraform CDK application.

### Option 1 - create a new project

```sh
# create a new project
npx create-eventual@latest\
  --language typescript\
  --platform aws-cdk

# enter the new project's directory
cd <project-name>

# deploy to AWS
npx cdk deploy
```

### Option 2 - add to an existing CDK project

```sh
npm install @eventual/core @eventual/aws-cdk
```

### Option 3 - add to an existing Pulumi project

```sh
npm install @eventual/core @eventual/aws-pulumi
```

### Option 4 - add to an existing Terraform CDK project

```sh
npm install @eventual/core @eventual/aws-cdktf
```

## Why Eventual?

Traditional applications rely heavily on centralized databases and transactions to maintain data consistency, but the world is moving towards an increasingly decoupled network of global micro-services that do not share a database. Orchestrating changes across these services without corrupting data is a challenging problem requiring deep understanding of distributed systems which takes time away from business-critical work and often leads to failures and a poor experience for customers.

Eventual provides a code-first experience that enables developers to focus on the business logic of an orchestration instead of worrying about low-level system co-ordination.

### 🧑‍💻 Developer-friendly experience

The code for a durable, long-running workflow in Eventual is almost identical to implementing a Lambda Function - simply wrap SDK clients with the `makeDurable` helper and then implement your handler as normal.

```ts
const dynamo = makeDurable(DynamoDocumentDBClient.from(new DynamoDBClient()));

export function handle(id: string) {
  // an exactly-once call to DynamoDB
  const item = await dynamo.get({
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: id,
    },
  });

  // ..
}
```

### 🤖 Turing complete workflow logic

Eventual allows you to use the constructs of mainstream programming languages to build workflows with unlimited complexity - including operators, for-loops, try-catch, if-else, while, do-while, etc.

```ts
try {
  await Promise.all(
    services.map(async (downStreamService) => {
      await downStreamService(a + b - c);
    })
  );
} catch (err) {
  console.error(err);
}
```

### 🧩 Extensible and configurable

All of the infrastructure required to run your workflow is packaged as simple, code-first IaC libraries - available on the [AWS CDK](https://aws.amazon.com/cdk/), [Pulumi](https://www.pulumi.com/) and [Terraform CDK](https://developer.hashicorp.com/terraform/cdktf) platforms. Integrating Eventual into an application can be done in minutes without installing complex, third-party software.

```ts
new eventual.Workflow(this, "MyWorkflow", {
  entry: path.join(__dirname, "my-workflow.js"),
  handler: "index.handle",
  runtime: lambda.Runtime.NODE_JS_16X,
});
```

### 🐞 Compatible with your testing tools

Use your preferred testing practices and frameworks to unit test workflows locally or within CI/CD.

```ts
import { handle as myWorkflow } from "../src/my-workflow";

test("workflow should be OK", async () => {
  const result = await myWorkflow({
    hello: "world",
  });

  expect(result).toBe("ok");
});
```

### ✅ Effortless fault tolerance

Behind the scenes, Eventual leverages AWS's serverless technology to orchestrate your code as a long-running workflow and ensure that each step executes with exactly-once semantics.

```ts
// execute a failure-sensitive transaction
await fromAccount.debit(amount);
await toAccount.credit(amount);
```

### 📊 Observability out of the box

Each workflow comes with its own built-in, customizable and extensible metrics, dashboards and alarms deployed to AWS CloudWatch. Integrate metrics into third-party metrics products such as DataDog in minutes with a simple configuration change and deployment. Deploy a management console UI into your own AWS account for visualizations and debugging capabilities.

```ts
const workflow = new eventual.Workflow(..);

// create an AWS CloudWatch alarm to alert when a workflow fails
new Alarm(this, 'FailedWorkflows', {
  comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
  threshold: 1,
  evaluationPeriods: 1,
  metric: workflow.metricFailures(),
});
```
