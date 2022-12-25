# Tutorial - create bank account and transfer money

In this tutorial, we'll create a basic bank application that supports the following operations:

1. create an account with an initial balance
2. transfer money between accounts

We'll create two APIs, `POST /accounts` and `POST /account/:accountId/transfers`. To define these routes we first need to import `api` from `@eventual/core`.

```ts
import { api } from "@eventual/core";
```

We can then use this object to register API routes - let's start with the route for creating an account.

```ts
api.post("/accounts", async (request) => {
  // todo
});
```

Great, we've defined our first API route. When a user makes a `POST /accounts` request, this function will be triggered.

Next, we need to implement the logic for this API. It'll need to generate an ID for the account and store a record of it in a database. This is a great use-case for AWS DynamoDB so let's take a short detour to show how to integrate an AWS Resource such as DynamoDB into a Service. Eventual is designed to work with any database of your choosing - we'll demo DynamoDB but this procedure is compatible with any cloud resource or service (whether AWS or external, e.g. Planetscale).

If you followed one of the [getting started guides](../getting-started/0-create-new-project.md) then you'll have a `Service` defined in your infrastructure stack. S1 omething like the following:

```ts
const service = new Service(stack, "Service", {
  entry: path.resolve("services", "functions", "index.ts"),
  name: "my-service",
});
```

This is where we create and configure infrastructure needed by our application. To create an AWS DynamoDB Table, import the `Table` Construct from `aws-cdk-lib/aws-dynamodb` and instantiate it along-side our service.

```ts
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";

const accounts = new Table(stack, "Accounts", {
  partitionKey: {
    name: "accountId",
    type: AttributeType.STRING,
  },
});
```

Next, add the new Table's ARN as an environment variable in the Service and grant read/write permissions. We add the environment variable so that we can discover the table in our code and we need read/write permissions or else storing data in the table would be impossible.

```ts
service.addEnvironment("TABLE_ARN", accounts.tableArn);

accounts.grantReadWriteData(service);
```

Our infrastructure now contains a DynamoDB Table for storing account information and our service has permission to read and write to it - awesome! Let's go back to our application code and update it to insert a record into this table.

First, import `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` and initialize a client - we'll need these for making requests against our new Table.

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DocumentDBClient } from "@aws-sdk/lib-dynamodb";

const client = DocumentDBClient.from(new DynamoDBClient({}));
```

Note: These are the official clients for DynamoDB maintained by AWS. Depending on what service you're integrating with, these clients might be different.

Next, update the API to generate an account ID and store a record in the Table. We'll use the famous `uuid` package for generating unique IDs and AWS's `PutCommand` to insert data.

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
});
```

This API is now capable of inserting data into a dynamodb table, but if you try to compile and deploy, you'll get a type error! Oops, we've forgotten to return a HTTP Response.

An API's handler must always return a Response object containing information such as the payload, status code, headers. To fix our code, we only need to return a new Response at the end of the function.

```ts
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

Note: Eventual builds on top of the Node Fetch API. If you're getting an error that `Response` cannot be found, make sure to include `DOM` in your `tsconfig.json`'s `lib` configuration.

```json
{
  "compilerOptions": {
    "lib": ["DOM"]
  }
}
```

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

Now our accounts have money it - woohoo! We can now move on to the more interesting part of this tutorial - transfers. We'll implement an API for transferring money between two accounts and we'll use a workflow to reliably orchestrate the operation.

Before that though, we need to implement two capabilities needed by every bank account (that I know of, at least) - `debit` and `credit`. `debit` will increase an account's balance and `credit` will decrease it. (TODO: i'm not sure if I have these round the wrong way).

We'll use the `activity` primitive from Eventual to implement two functions, `debit` and `credit`.

Note: I'm going to skip over the implementation details as the AWS DynamoDB API is outside the scope of this tutorial. In brief, we'll use an UpdateCommand to modify the balance accordingly and ensure the account exists (or else fail the operation). For more information on how to interact with DynamoDB, see the official docs. You may also want to consider using a higher level library such as ElectroDB or DynamoDB Toolbox instead of the low level API which is known for being quite verbose.

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

You may be wondering why the extra ceremony of wrapping these functions in an `activity`. I don't blame you, at first glance it does seem unnecessary. But the reason why we wrap them in activities is because we are going to use Eventual's most powerful primitive, `workflow`, to reliably orchestrate the transfer process.

Transferring money between two accounts is one of those scenarios in business where it's really important that it's done right. We're talking about people's money here so any mistakes have very real world impact.

To illustrate the power of a workflow, let's first consider what might happen if we were to implement the transfer process directly within an API handler.

```ts
api.post("/transfers", async (request) => {
  const { from, to, amount } = await request.json();

  await debit(from, amount);
  await credit(to, amount);
});
```

At first glance, this might look correct - and in many cases it would behave totally fine. But what if we fail to credit the to-account after already debiting the from account? If it fails then we end up in a corrupted state where one account has been modified but the other hasn't - uh oh, infinite money glitch!

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
