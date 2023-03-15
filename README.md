<div align="center">
  <a href="https://eventual.net">
    <img src="assets/eventual-logo-white-bg-128px.svg" />
  </a>
  <br />
  <h1>eventual</h1>
  <h3>
  Build scalable and durable micro-services with APIs, Messaging and Workflows.
  </h3>
  
  
  <a href="https://badge.fury.io/js/@eventual%2Fcore.svg">
    <img src="https://badge.fury.io/js/@eventual%2Fcore.svg" />
  </a>
  <a href="https://github.com/eventual/eventual/blob/main/LICENSE">
    <img alt="Apache 2.0 License" src="https://img.shields.io/github/license/functionless/eventual" />
  </a>
  <a href="https://discord.gg/8hfnTn3QDT">
    <img alt="Discord" src="https://img.shields.io/discord/985291961885949973?color=7389D8&label&logo=discord&logoColor=ffffff" />
  </a>
  <a href="https://twitter.com/EventualCloud">
    <img alt="Twitter" src="https://img.shields.io/twitter/url.svg?label=%40EventualCloud&style=social&url=https%3A%2F%2Ftwitter.com%2FEventualCloud" />
  </a>
</div>

---

> 🛠&nbsp; Eventual is in pre-release - come chat to us on [Discord](https://discord.gg/8hfnTn3QDT)!

---

## Overview

**[Website](https://eventual.net/) • [API Docs](https://docs.eventual.net) • [Quick Start](https://docs.eventual.net/getting-started)**

Develop massively distributed systems without friction → Iterate locally on your machine → Deploy to your own cloud infrastructure

### Develop

- 🌎 **APIs** - expose RPC and REST endpoints
- 🚦 **Orchestration** - build long running, durable workflows using plain TypeScript - such as if-else, loops, functions, async/await, and all that goodness
- 💬 **Messaging** - publish and subscribe to events within and across service boundaries.
- ✅ **End-to-end type safety** - from your frontend → backend → infrastructure

### Iterate

- 🧪 **Local Testing** - unit test with fine-grained control over timing to catch tricky edge cases
- 🤖 **Simulate** - run your massively distributed system, locally and deploy only when it's working
- 🐞 **Debug Production** - replay and debug production workflows from the comfort of your IDE

### Deploy

- 🛠 **Infrastructure as Code** - integrates directly into the AWS CDK and Pulumi
- 🌩️ **Your Cloud** - runs in your own infrastructure and security boundaries
- 📈 **Serverless** - we shield you from the complexities of distributed systems and ensure a consistent, best-practice serverless architecture

## Quick Start

Start a new project with Eventual or drop-in to an existing AWS CDK or SST application by visiting the [Quick Start](https://docs.eventual.net/getting-started).

```sh
# create a new project
npm create eventual

# enter the new project's directory
cd <project-name>

# deploy to AWS
npx cdk deploy
```

## What is Eventual?

Eventual makes building and operating resilient event-driven applications easy at any scale. Its code-first workflow engine and event-driven primitives simplify and standardize how teams solve complex business orchestration problems and evolve system architectures over time. Leverages Serverless to scale from 0 to any sized workload and your favorite Infrastructure-as-Code framework to drop directly in to your stack without getting in your way.

We highly recommend checking out [Werner Vogel's 2022 AWS RE:Invent Keynote](https://www.youtube.com/watch?v=RfvL_423a-I&t=328s).

With our plug-and-play foundation blocks, you can use as much or as little as needed to build your distributed system. These building blocks include:

### 🌐 Serverless REST APIs

Easily create scalable, event-driven APIs with code-first routes.

```ts
import { api, HttpResponse } from "@eventual/core";

api.post("/echo", async (request) => {
  return new HttpResponse(await request.text());
});
```

### 📣 Publish and subscribe to Events

```ts
import { event } from "@eventual/core";

interface MyEvent {
  key: string;
}

export const myEvent = event<MyEvent>("MyEvent");

myEvent.onEvent("onMyEvent", (e) => {
  console.log(e.key);
});
```

### 🤖 Turing complete, imperative workflows

Eventual allows you to use the full power of TypeScript to build long-running, durable workflows with unlimited complexity - including operators, for-loops, try-catch, if-else, while, do-while, etc.

```ts
export const myWorkflow = workflow("myWorkflow", async (items: string[]) => {
  try {
    await Promise.all(
      items.map(async (item) => {
        if (isConditionTrue(item)) {
          await downStreamService(`hello ${item}`);
        }
      })
    );
  } catch (err) {
    console.error(err);
  }
});
```

### 🧪 Unit test and simulate distributed systems

Easily unit test your service's business logic, including APIs, workflows, and event handlers, using your preferred testing practices and frameworks. Run tests locally or within your CI/CD pipeline to ensure your service is reliable and maintainable.

```ts
import { myWorkflow } from "../src/my-workflow";

const env = new TestEnvironment({
  entry: path.join(__dirname, "..", "src", "my-workflow.ts")
})

test("workflow should be OK", async () => {
  const execution = await env.startExecution(myWorkflow, ({
    hello: "world",
  });

  // advance time
  await env.tick(1);

  expect(await execution.getStatus()).toMatchObject({
    status: ExecutionStatus.SUCCESS
  });
});
```

### 🐞 Debug production problems locally in your IDE

Replay problematic workflows in production locally and use your IDE's debugger to discover and fix problems.

![Debug Production](./assets/debug-1.gif)

```
eventual replay execution <execution-id> --entry ./src/index.ts
```

### 🔌 Integrate with Cloud Resources and Services

```ts
import { Slack, SlackCredentials } from "@eventual/integrations-slack";
import { AWSSecret } from "@eventual/aws-client";

const slack = new Slack("my-slack-connection", {
  credentials: new JsonSecret<SlackCredentials>(
    new AWSSecret({
      secretId: process.env.SLACK_SECRET_ID!,
    })
  ),
});

// register a webhook for a slack command
slack.command("/ack", async (request) => {
  await sendSignal(request.text, "ack");
  request.ack();
});

export const task = workflow("task", async (request) => {
  await expectSignal("ack");

  // publish a message to slack from a workflow
  await slack.client.chat.postMessage({
    channel: request.channel,
    text: `Complete: ${request.task}`,
  });
});
```
