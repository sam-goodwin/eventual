# Activity

An Activity is a function that can be called from within a [Workflow](./3-workflow.md). Its purpose is to encapsulate integration logic such as database calls, API calls, or waiting for humans/other long-running operations to complete from within a workflow. Activities provide a way to abstract away the implementation details of these integrations and allow them to be reused across different workflows.

## Create an Activity

To create an activity, you will need to import the `activity` function from the `@eventual/core` library:

```ts
import { activity } from "@eventual/core";
```

Then, you can define an activity by providing a unique name and its implementation as an asynchronous function:

```ts
const sendEmail = activity("sendEmail", async (to: string, body: string) => {
  // send the email using a third-party email service
});
```

## Call an Activity from within a Workflow

o call an activity from within a workflow, you can simply await the activity function like you would any other asynchronous function:

```ts
workflow("send-email-workflow", async (input: { to: string; body: string }) => {
  await sendEmail(input.to, input.body);
});
```

## Async Activity

Async activities allow you to perform work that takes longer than the maximum 15 minute runtime of an AWS Lambda function. They work by returning a "token" from the activity function, which can be used to complete or fail the activity at a later time. This is useful for situations where you need to wait for a human to complete a task or for an expensive process to run on a cluster.

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

Tracking: https://github.com/functionless/eventual/issues/137
