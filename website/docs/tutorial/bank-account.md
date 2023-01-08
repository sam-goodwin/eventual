---
title: Bank Account - Part 1
---

# Tutorial - create bank account and transfer money

Note: this tutorial is a WIP. We recommend starting with the [getting started guide](../getting-started.mdx) or [examples](https://github.com/functionless/eventual/tree/main/examples).

In this tutorial, we'll create a basic bank application that supports the following operations:

1. create an account with an initial balance
2. transfer money between accounts

## Pre-requisites

You must have an AWS account and either an AWS CDK or SST project. You can use the [getting started guide](../getting-started.mdx) to create a new project quickly or manually configure an existing one.

## Step 1 - create an API

First, import the `api` object from `@eventual/core` and add a stub for the `POST /accounts` API:

```ts
import { api } from "@eventual/core";

api.post("/accounts", async (request) => {
  // todo
});
```

This will define a new API route that will be triggered when a user makes a POST /accounts request.

## Step 2 - configure an AWS DynamoDB Table

To implement the logic for the API, we will generate an ID for the account and store a record of it in a database. We will use AWS DynamoDB as an example, but this process is compatible with any cloud resource or service.

First, create a `Service` in your infrastructure stack. If you followed the [getting started guide](../getting-started.mdx), this will already exist.

```ts
const service = new Service(stack, "Service", {
  entry: path.resolve("services", "functions", "index.ts"),
  name: "my-service",
});
```

Next, import and instantiate a `Table` from `aws-cdk-lib/aws-dynamodb`:

```ts
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";

const accounts = new Table(stack, "Accounts", {
  partitionKey: {
    name: "accountId",
    type: AttributeType.STRING,
  },
});
```

Add the table's ARN as an environment variable in the `Service` and grant read/write permissions:

```ts
service.addEnvironment("TABLE_ARN", accounts.tableArn);

accounts.grantReadWriteData(service);
```

Now, import and initialize the DynamoDB client into your file containing the `/accounts` API:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DocumentDBClient } from "@aws-sdk/lib-dynamodb";

const client = DocumentDBClient.from(new DynamoDBClient({}));
```

Now we can finally implement the API. Use the `uuid` package to generate an ID for the account and send a `PutCommand` to insert a record into the table:

```ts
import uuid from "uuid";

api.post("/accounts", async (request) => {
  const accountId = uuid.v4();

  await client.send(
    new PutCommand({
      TableName: process.env.TABLE_ARN!,
      Item: {
        accountId,
        balance: 0, // initial balance will be 0
      },
    })
  );

  // return a JSON payload `{ "accountId": <account-id> }` as the response
  return new Response(JSON.stringify({ accountId }));
});
```

## Step 3 - update our API to accept an initial balance

We now have accounts, but those accounts always have a balance of `0` (which is not very useful). Let's update our API to allow for an initial balance to be set - it will now accept a JSON object containing a `balance` property.

```json
POST /accounts
{
  "balance": 100
}
```

To parse the body, we can use the `json()` utility available on the `Response` data type.

```ts
const body = await response.json();
```

For now, we'll not bother validating the input, but in a real-world scenario this is where should validate the input matches what your API requires.

Next, let's update the PutCommand to use the balance from the `body` instead of defaulting to `0`.

```ts
await client.send(
  new PutCommand({
    TableName: process.env.TABLE_ARN!,
    Item: {
      accountId,
      balance: body.balance,
    },
  })
);
```

## Step 4 - implement the /transfers API

Now that our accounts have money it, we can move on to the more interesting part of this tutorial - transfers. We'll implement an API for transferring money between two accounts and we'll use a workflow to prevent corruption.

Before that though, we need the ability to `debit` and `credit` accounts - let's quickly add them as a way to introduce the concept of an `activity`:

```ts
const debit = activity("debit", async (accountId: string, amount: number) => {
  await client.send(
    new UpdateCommand({
      TableName: process.env.TABLE_ARN!,
      Key: {
        accountId,
      },
      UpdateExpression: "SET balance = balance - :amount",
      ExpressionAttributeValues: {
        ":amount": amount,
      },
      ConditionExpression: "attribute_exists(accountId)",
    })
  );
});

const credit = activity("credit", async (accountId: string, amount: number) => {
  await client.send(
    new UpdateCommand({
      TableName: process.env.TABLE_ARN!,
      Key: {
        accountId,
      },
      UpdateExpression: "SET balance = balance + :amount",
      ExpressionAttributeValues: {
        ":amount": amount,
      },
      ConditionExpression: "attribute_exists(accountId)",
    })
  );
});
```

The purpose of this wrapping is to allow the use of Eventual's `workflow` primitive to reliably orchestrate the transfer process. Since workflows cannot directly interact with databases, the activity wrapper enables the workflow to indirectly access the database through these functions.

To illustrate the necessity a workflow, let's first consider what might happen if we were to implement the transfer process directly within the API handler.

```ts
api.post("/transfers", async (request) => {
  const { from, to, amount } = await request.json();

  await debit(from, amount);
  await credit(to, amount);
});
```

At first glance, this might look correct - and in many cases it would behave totally fine. But what if we fail to credit the to-account after already debiting the from account? If it fails then we end up in a corrupted state where one account has been modified but the other hasn't - uh oh, we may gave created an infinite money glitch!

To fix this, you might think to add a try-catch and reverse the transaction if the credit fails.

```ts
await debit(from, amount);
try {
  await credit(to, amount);
} catch {
  await debit(to, amount);
}
```

Great, now when `credit` fails the code will roll the transaction back to the original state. But wait ... what if that `debit` also then fails? We'll still be in the corrupted state! Damn it, we're back where we started.

Your next thought might be to update the code to keep trying to rollback until it succeeds:

```ts
while (true) {
  try {
    await debit(to, account);
    break;
  } catch {
    await sleep(1);
  }
}
```

But this is futile ... it is simply impossible to guarantee that we'll eventually succeed because serverless functions can time out and servers can crash or reboot. An API handler is simply incapable of reliably orchestrating this type of operation without corrupting state.

So what do we do?

This type of scenario is actually very common and is exactly what a `workflow` is for. Unlike an API handler, a workflow is not constrained by the runtime of a serverless function or a server. Each operation in a workflow is carried out by first enqueuing a message onto a durable queue (such as SQS or AWS Lambda Async Invoke) from which a worker consumes and then carries out the operation.

This durable queue provides us with a mechanism to more carefully perform work. It doesn't matter if the workflow code crashes because we've persisted our intent to modify an account onto the queue. When the system recovers, we can pick up where we left off.

This is a very common technique in distributed systems. You'll see it all over the place - anywhere two systems need to be coordinated without corrupting state. Eventual's `workflow` primitive is an abstraction of this concept designed to empower developers to apply these patterns without having to worry about the low-level infrastructure and co-ordination required to implement it.

To demonstrate, let's extract the transfer code out into workflow instead of embedding it in the API:

```ts
export const transfer = workflow(
  "transfer",
  async (input: { from: string; to: string; amount: number }) => {
    await debit(from, amount);

    // loop forever until we successfully credit the to-account
    while (true) {
      try {
        await credit(to, amount);
        break;
      } catch {
        await sleep(1);
      }
    }
  }
);
```

That's all it takes. The code is identical except now our logic has moved into a `workflow`. Code inside this function behaves like described before - each operation, such as `await debit(..)` is performed using a queue behind the scenes and the Eventual framework takes care of all the plumbing. You can still write code like you would implement an API handler, but with the runtime guarantees of a durable workflow.

Now all that's left to do is update the api to start this workflow and return a reference to the execution.

```ts
api.post("/transfers", async (request) => {
  const { from, to, amount } = await request.json();

  const { executionId } = await transfer.startExecution({
    input: {
      from,
      to,
      amount,
    },
  });

  return new Response(JSON.stringify({ executionId }), {
    // request is accepted and is being processed (202)
    status: 202,
  });
});
```

You've now successfully implemented your first Eventual Service. In the next tutorial, we'll expand on this example with the ability for a user to cancel a transaction within a specific time window. We'll also introduce the concepts of Events which we'll use to broadcast a record of each transaction.
