# Activity

An Activity is a named function that can be called from within a [Workflow](./3-workflow.md). Its purpose is to encapsulate integration logic such as database calls or waiting for humans/other long-running operations to complete from within a workflow.

## Create an Activity

To create an activity, import the `activity` function from `@eventual/core`:

```ts
import { activity } from "@eventual/core";
```

Then, create an activity by providing a unique name and its implementation:

```ts
const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});
```

## Call an Activity from within a Workflow

```ts
workflow("my-workflow", async (name: string) => {
  const message = await hello(name);
});
```

## Async Activity

An activity handler runs within an AWS Lambda Function which is billed per unit of time and can only run for a maximum of 15 minutes. Sometimes an activity needs to perform some work that takes longer than 15 minutes, such as waiting for a human to acknowledge some task or waiting for an expensive job to run on some cluster. We call these operations "async activities" because their result is determined asynchronously via a callback to a "token" instead of synchronously by the call to the Activity handler.

To create an async activity, import and call the `asyncResult` function from `@eventual/core` within your activity and return its result as the activity's result:

```ts
import { asyncResult } from "@eventual/core";

const asyncHello = activity("hello", async (name: string) => {
  return asyncResult((token) => {
    // TODO
  });
});
```

By returning the result of an `asyncResult` call, a workflow will no longer consider the activity complete until the `token` is reported on.

The `asyncResult` function accepts a callback which it passes a `token` to. You can then do what you want with this token, such as storing it in a database:

```ts
const asyncHello = activity("hello", async (name: string) => {
  return asyncResult((token) => {
    await ddb.send(
      new PutCommand({
        TABLE_NAME: process.TABLE_NAME,
        Item: {
          id: uuid(),
          token,
        },
      })
    );
  });
});
```

### Complete an Activity

Elsewhere in your application code (for example an API) you can complete the activity using the `complete` API:

```ts
api.post("/ack/:token", async (request) => {
  await asyncHello.complete({
    activityToken: token,
    result: `hello world`
  };
});
```

### Fail an Activity

Elsewhere in your application code (for example an API) you can fail the activity using the `fail` API:

```ts
api.post("/ack/:token", async (request) => {
  await asyncHello.fail({
    activityToken: token,
    result: new Error("failure")
  };
});
```

### Complete an Activity from outside Eventual

TODO
