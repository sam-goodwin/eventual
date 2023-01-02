---
sidebar_position: 5
---

# Activity

An Activity is a function that can be called from within a [Workflow](./workflow.md). Its purpose is to encapsulate integration logic such as database calls, API calls, or waiting for humans/other long-running operations to complete from within a workflow. Activities provide a way to abstract away the implementation details of these integrations and allow them to be reused across different workflows.

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

To call an activity from within a workflow, you can simply await the activity function like you would any other asynchronous function:

```ts
workflow("send-email-workflow", async (input: { to: string; body: string }) => {
  await sendEmail(input.to, input.body);
});
```

## Async Activity

Async activities are a way to perform work that takes longer than the maximum 15 minute runtime of an AWS Lambda function. They allow you to return a `token` from the activity function, which can be used to succeed or fail the activity at a later time. This is useful when you need to wait for a human to complete a task or for an expensive process to run on a cluster.

To create an async activity, you will need to import the `asyncResult` function from the `@eventual/core` library and return its result as the activity's result:

```ts
import { asyncResult } from "@eventual/core";

const asyncHello = activity("hello", async (name: string) => {
  return asyncResult((token) => {
    // do something with the token, such as storing it in a database
  });
});
```

This will cause the workflow to wait for the token to be succeeded or failed before moving on to the next step.

### `sendActivitySuccess`

The `sendActivitySuccess` method is used to mark an asynchronous activity as successfully completed. This is done by providing the activity's token and the result of the activity. This method is typically called after the activity has been performed and the result has been computed.

```ts
api.post("/ack/:token", async (request) => {
  await asyncHello.sendActivitySuccess({
    activityToken: token,
    result: `hello world`,
  });
});
```

### `sendActivityFailure`

The `sendActivityFailure` method is used to mark an asynchronous activity as failed. This is done by providing the activity's token and the error that caused the failure. This method is typically called when an error occurs during the performance of the activity.

```ts
api.post("/fail/:token", async (request) => {
  await asyncHello.sendActivityFailure({
    activityToken: token,
    error: new Error("failure"),
  });
});
```

### Explicit Return Type

The `asyncResult` function allows you to specify the expected return type of an async activity. This can be helpful for ensuring type safety and avoiding runtime errors.

To specify the return type of an async activity, provide a type parameter to `asyncResult`:

```ts
return asyncResult<string>((token) => {
  // do something with the token, such as storing it in a database
});
```

The return type of the activity function will be `Promise<string>`. This means that, when calling the `sendActivitySuccess` function, the `result` field must be of type `string`.

```ts
const myActivity = activity("myActivity", async () => {
  return asyncResult<string>((token) => {
    // do something with the token
  });
});

await myActivity.sendActivitySuccess({
  result: "hello world", // valid
});

await myActivity.sendActivitySuccess({
  result: 123, // invalid, number is not a string
});
```

If you do not specify the return type of an async activity, it will be inferred as `any`. This means that the return type of the activity function will be `Promise<any>`, and there will be no type checking when calling complete. It is generally a good idea to specify the return type of an async activity to ensure type safety and avoid potential runtime errors.

### Succeed an Activity from outside Eventual

TODO

Tracking: https://github.com/functionless/eventual/issues/137

## Timeout

An Activity can be configured to fail if it does not succeed within a specified time frame. To do this, use the `timeoutSeconds` property when defining the activity.

For example, the following activity will fail if it does not succeed within 100 seconds:

```ts
export const timedOutWorkflow = workflow(
  "timedOut",
  { timeoutSeconds: 100 },
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 101 * 1000));
  }
);
```

You can then handle a timeout error within a workflow by catching the `Timeout` error.

```ts
try {
  await timedOutWorkflow();
} catch (err) {
  if (err instanceof Timeout) {
    // the activity timed out
  }
}
```

## Heartbeat

The Heartbeat feature in Eventual allows you to configure an Activity to report its progress at regular intervals while it is executing. This can be useful in cases where an Activity is performing a long-running task and you want to ensure that it is still making progress and has not gotten stuck.

To use the Heartbeat feature, you can specify the `heartbeatSeconds` property when defining your Activity. This property specifies the interval, in seconds, at which the Activity is required to report a heartbeat. If the Activity does not report a heartbeat within this interval, it will be considered failed and a `HeartbeatTimeout` exception will be thrown.

Here is an example of how to define an Activity with a heartbeat interval of 10 seconds:

```ts
const activityWithHeartbeat = activity(
  "activityWithHeartbeat",
  {
    // configure this activity to be required to report a heartbeat every 10 seconds
    heartbeatSeconds: 10,
  },
  async (workItems: string[]) => {
    for (const item of workItems) {
      // perform some work
      await processItem(item);
      // report a heartbeat back
      await sendActivityHeartbeat();
    }
  }
);
```

To report a heartbeat from within your Activity, you can call the `sendActivityHeartbeat` function included in the `@eventual/core` library. This function should be called at regular intervals to ensure that the required heartbeat interval is met.

```ts
import { heartbeat } from "@eventual/core";

await heartbeat();
```

When calling an Activity with the Heartbeat feature from within a Workflow, you can catch the `HeartbeatTimeout` exception to handle cases where the Activity has failed due to a heartbeat timeout:

```ts
try {
  await activityWithHeartbeat();
} catch (err) {
  if (err instanceof HeartbeatTimeout) {
    // the activity did not report heartbeat in time
  }
}
```

## Supported Intrinsic Functions

Alongside the activity-specific intrinsics already mentioned, the following intrinsic functions can also be called within an activity handler:

- [`publishEvent`](./event.md#publish-to-an-event)

```ts
await myEvent.publishEvent({ .. });
```

- [`startExecution`](./workflow.md#start-execution)

```ts
await myWorkflow.startExecution({
  input: <input payload>
})
```

- [`sendActivitySuccess`](#sendactivitysuccess)

```ts
await myActivity.sendActivitySuccess({
  token: <token>,
  result: <result>
})
```

- [`sendActivityFailure`](#sendactivityfailure)

```ts
await myActivity.sendActivityFailure({
  token: <token>,
  error: <error>
})
```
