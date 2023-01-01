---
sidebar_position: 6
---

# Unit Testing

Eventual provides a built-in library, `@eventual/testing`, for mocking and testing applications locally.

## `TestEnvironment`

The `TestEnvironment` is the core of Eventual's testing capabilities. It allows you to control how time progresses in a test environment, mock activity responses or send mock events and signals, etc.

### Create a new `TestEnvironment`

To create a new `TestEnvironment`, import the `TestEnvironment` class from `@eventual/testing` and then instantiate it and call `initialize`.

```ts
const env = new TestEnvironment({
  entry: path.resolve(
    url.fileURLToPath(new URL(".", import.meta.url)),
    "./workflow.ts"
  ),
});

await env.initialize();
```

It's common to use a `beforeAll` test hook (or equivalent) to ensure the environment is created before any tests run.

```ts
let env: TestEnvironment;

// if there is pollution between tests, call reset()
beforeAll(async () => {
  env = new TestEnvironment({
    entry: path.resolve(
      url.fileURLToPath(new URL(".", import.meta.url)),
      "./workflow.ts"
    ),
  });

  await env.initialize();
});
```

The above example uses `import.meta.url` from ESM. If you're using CommonJS (CJS) or another legacy node module system, you can use `__dirname` instead:

```ts
new TestEnvironment({
  entry: path.resolve(__dirname, "./workflow.ts"),
});
```

## Testing Workflows

### Start Workflow Execution

You can start an execution of a workflow using the `startExecution` method. It accepts two arguments: the workflow to start a mock execution of and the input argument.

For example, to start an execution of a workflow that accepts no input parameters, you can pass `undefined` as the input argument:

```ts
// import your workflow from the src
import { myWorkflow } from "../src/index.js";

// start an execution of the workflow
await env.startExecution(myWorkflow, undefined);
```

On the other hand, if the workflow requires an input parameter of a certain type, you must pass a value of that type as the input argument:

```ts
const myWorkflow = workflow("myWorkflow", async (input: string) => {
  // ..
});

await env.startExecution(myWorkflow, "input string");
```

### Get Workflow Status

The `startExecution` method returns an [`ExecutionHandle`](./workflow.md#execution-handle), which is a reference to a running workflow execution. You can use the [`getStatus`](./workflow.md#get-the-status-of-an-execution) method to retrieve the current status of the execution:

For example, to start a workflow, advance time and then assert the status is `FAILED`, you can run the following code:

```ts
const execution = await env.startExecution(myWorkflow, undefined);
await env.tick();

const status = await execution.getStatus();
expect(status).toMatchObject({
  status: ExecutionStatus.FAILED,
});
```

### Send Signal

The `sendSignal` method sends a signal to the [`ExecutionHandle`](./workflow.md#send-a-signal-to-a-running-execution).

For example, to start a workflow, send a signal, advance time and then assert the status is `COMPLETE`, you can run the following code:

```ts
const execution = await env.startExecution(myWorkflow, undefined);
await execution.sendSignal(mySignal, "value");
await env.tick();

const status = await execution.getStatus();
expect(status).toMatchObject({
  status: ExecutionStatus.COMPLETE,
});
```

## Controlling Time

The `TestEnvironment` class provides utilities for controlling time.

### Start Time

When creating a new `TestEnvironment`, you can specify the `start` property to initialize the environment at a specific point in time. For example:

```ts
new TestEnvironment({
  // start the time at the beginning of the year, 2023
  start: new Date("2023-01-01T00:00Z"),
});
```

### `resetTime`

The `resetTime` method will reset an environment's time back to the time it was initialized with. It is common to use `afterEach` to reset an environment's time before each test runs. This ensures that each test runs with a consistent view of time and does not affect one another.

```ts
afterAll(() => {
  env.resetTime();
});
```

### `tick` - advance time

The `tick` method can be used to advance time within the test environment. It takes a number of seconds as an argument, which represents the amount of time to advance. For example:

```ts
await env.tick(1); // advance time by 1 second
await env.tick(2); // advance time by 2 seconds
```

If no argument is provided, `tick` advances time by 1 second by default. This can be useful when you want to advance time by a small amount, but don't need to specify an exact amount.

```ts
await env.tick(); // advance time by 1 second
```

You can use `tick` to simulate the passage of time in your tests, which can be useful for testing time-based functionality such as timeouts.

```ts
// test a timeout of 5 seconds
await env.tick(5); // advance time by 5 seconds
```

### `tickUntil` - advance time to a specific timestamp

The `tickUntil` method allows you to advance time in the test environment to a specific point in time. It takes a timestamp as an argument, which can be provided as an ISO8601 string or a `Date` object. The method will advance time one tick at a time until the test environment reaches the specified timestamp.

For example, to advance time to the beginning of the year 2023:

```ts
await env.tickUntil("2023-01-01T00:00Z");
```

You can also provide a `Date` object as the argument:

```ts
await env.tickUntil(new Date(epochMilliseconds));
```

You can use `tickUntil` to simulate the passage of time in your tests without having to compute tick intervals, which can be useful for testing time-based functionality such as scheduled activities.

```ts
// test a scheduled activity that runs every hour
await env.tickUntil("2023-01-01T01:00Z"); // advance time to  01:00
```

## Mocking Activities

While testing workflows, it is often necessary to mock the behavior of an activity.

### `mockActivity`

The `mockActivity` function on `TestEnvironment` allows you to create a mock of an activity. This mock object can be used to control the result of an activity from the perspective of a workflow.

```ts
const mockedActivity = env.mockActivity(myActivity);
```

The `mockActivity` provides the following utility functions that can be used to mock its behavior in tests:

| Resolution                                                              | Description                                           |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| [`succeed`](#succeed) and [`succeedOnce`](#succeedonce)             | Activity returns a result                             |
| [`fail`](#fail) and [`failOnce`](#failonce)                             | Activity fails with an error                          |
| [`timeout`](#timeout) and [`timeoutOnce`](#timeoutonce)                 | Activity fails with a Timeout error                   |
| [`invoke`](#invoke) and [`invokeOnce`](#invokeonce)                     | Activity will call your delegate function             |
| [`invokeReal`](#invokereal) and [`invokeRealOnce`](#invokerealonce)     | Activity will call the real underlying implementation |
| [`asyncResult`](#asyncresult) and [`asyncResultOnce`](#asyncresultonce) | Activity will return an async result token            |

### `succeed`

Use the `succeed` method to set up a mocked activity to always succeed with a specified value:

```ts
mockedActivity.succeed("value");
```

### `succeedOnce`

Use the `succeedOnce` method to set up a mocked activity to succeed once with a specific value, and then behave differently on subsequent invocations.

```ts
mockedActivity.succeedOnce("once").succeed("value");
```

For example, in the above code, the first time this mocked activity is called, it will succeed with the value `"once"`. All subsequent calls will then succeed with `"value"`.

### `fail`

Use the `fail` method to set up a mocked activity to always fail with a specified error:

```ts
mockedActivity.fail(new Error("oops"));
```

### `failOnce`

Use the `failOnce` method to set up a mocked activity to fail once with a specific value, and then behave differently on subsequent invocations.

```ts
mockedActivity.failOnce(new Error("oops"));
```

### `timeout`

Use the `timeout` method to set up a mocked activity to always timeout:

```ts
mockedActivity.timeout();
```

### `timeoutOnce`

Use the `timeoutOnce` method to set up a mocked activity to timeout once, and then behave differently on subsequent invocations.

```ts
mockedActivity.timeoutOnce();
```

### `invoke`

Use `invoke` to set up a mocked activity to always mock a provided function.

For example, a useful pattern is to proxy activity invocations to a Jest Mocked Function and then make assertions on the mock function:

```ts
const mockedFn = jest.fn();

mockActivity.invoke(mockedFn);

await env.tick();

expect(mockedFn).toHaveBeenCalled();
```

### `invokeOnce`

Use the `invokeOnce` method to set up a mocked activity to invoke the provided function once, and then behave differently on subsequent invocations.

```ts
const mockedFn = jest.fn();

mockActivity.invokeOnce(mockedFn);
```

### `invokeReal`

Use `invokeReal` to set up a mocked activity to always invoke the real, underlying function.

```ts
mockedActivity.invokeReal();
```

The "real function" refers to the function implementation defined on the activity being mocked:

```ts
const myActivity("myActivity", async () => {
  // (this function)
})
```

### `invokeRealOnce`

Use the `invokeRealOnce` method to set up a mocked activity to invoke the real function once, and then behave differently on subsequent invocations.

```ts
mockedActivity.invokeRealOnce();
```

### `asyncResult`

Use the `asyncResult` method to set up a mocked activity to always return an async token:

```ts
mockedActivity.asyncResult();
```

It accepts an optional callback argument that will be called with the token. This callback can be used to pass to capture the token for use within the test.

```ts
let activityToken;

// mock the result and save the token
mockActivity.asyncResult((token) => {
  activityToken = token;
});

// kick off the workflow
await env.startExecution(longRunningWorkflow, undefined);

// and allow it time to progress
await env.tick();

// check the activityToken was received
if (!activityToken) {
  fail("Expected activity token to be set");
}

// mock the token being completed
await env.sendActivitySuccess({
  activityToken,
  result: {
    value: "hello from the async mock",
  },
});
```

### `asyncResultOnce`

Use the `asyncResultOnce` method to set up a mocked activity to return an async token, and then behave differently on subsequent invocations.

```ts
mockedActivity.asyncResultOnce();
```

It accepts an optional callback argument that will be called with the token. This callback can be used to pass to capture the token for use within the test.

```ts
let activityToken;

// mock the result and save the token
mockActivity.asyncResultOnce((token) => {
  activityToken = token;
});

// kick off the workflow
await env.startExecution(longRunningWorkflow, undefined);

// and allow it time to progress
await env.tick();

// check the activityToken was received
if (!activityToken) {
  fail("Expected activity token to be set");
}

// mock the token being completed
await env.sendActivitySuccess({
  activityToken,
  result: {
    value: "hello from the async mock",
  },
});
```

## Testing Activities

[Activities](./activity.md) are functions that are executed within the context of an Eventual workflow. They can be tested in the same way as regular functions, with the exception of activities that use the asyncResult and heartbeat intrinsic functions. These activities are currently not supported and can be tracked in this issue: https://github.com/functionless/eventual/issues/167.

### Call an Activity from within a Test

To test an activity, you can import it from your source code and call it with the desired input arguments, just like any other function. Then, you can make assertions about the output or the side effects of the activity. For example:

```ts
import { myActivity } from "../src/index.js";

const result = await myActivity("input value");
expect(result).toEqual("expected output");
```

### Mock an Activity's dependencies

To test the interactions of the myActivity activity with external dependencies, such as APIs or databases, you can use mocking libraries like Jest.

For example, given an activity, `myActivity`, that imports and calls a function, `sendRequest`:

```ts
import { sendRequest } from "./my-api";

export const myActivity = activity("myActivity", async () => {
  // call some
  return await sendRequest();
});
```

First, create a mock for the `sendRequest` function that `myActivity` calls using jest.mock or a similar method. Then, invoke the `myActivity` activity and use assertions to verify that it behaves as expected when interacting with the mocked function.

```ts
import { myActivity } from "../src/index.js";

// Create a mock for the sendRequest function that myActivity calls
jest.mock("../src/my-api", () => ({
  sendRequest: jest.fn(() => Promise.resolve("mocked response")),
}));

// Invoke the myActivity activity
const result = await myActivity("input value");

// Use an assertion to verify that the result of the activity is what we expect
expect(result).toEqual("mocked response");
```

## Testing Events

### `publishEvent`s into an environment

To simulate an event being published to a Service, use the `publishEvent` method. It accepts two arguments: a reference to the event to publish and its data. For example:

```ts
await env.publishEvent(myEvent, {
  prop: "value",
});
```

Note: calling `publishEvent` will progress time by one until, identically to calling `await env.tick()`.

Here is a more advanced example that tests an event handler that sends a signal to a workflow execution by its ID:

```ts
const myEvent = event<{ executionId: string }>("myEvent");

myEvent.onEvent(({ executionId }) => {
  await sendSignal(executionId, "mySignal", "data");
});

const myWorkflow = workflow("myWorkflow", async () => {
  await expectSignal("mySignal");
});
```

To test this complex flow:

```ts
// start the workflow execution
const execution = await env.startExecution(myWorkflow);

// publish an event into the test environment
await env.publishEvent(myEvent, {
  executionId: execution.executionId,
});

// and assert that is is COMPLETE - the event handler should have allowed it to complete
expect(await execution.getStatus()).toMatchObject({
  status: ExecutionStatus.COMPLETE,
});
```

### `onEvent` - listen to events in a TestEnvironment

The `onEvent` method can be used to subscribe a test handler to an event within a `TestEnvironment` so that you can capture events published by your application and make assertions.

For example, imagine you want to test that the below workflow publishes to `myEvent`:

```ts
const myWorkflow = workflow("myWorkflow", async () => {
  await myEvent.publishEvent({ .. });
})
```

You can use the `onEvent` method to subscribe a mock handler to `myEvent` and then assert it was called after advancing time:

```ts
// start the workflow
env.startExecution(myWorkflow, undefined);

// create a mock function
const mockHandler = jest.fn();

// subscribe the mock to the myEvent
env.onEvent(myEvent, mockHandler);

// allow time to progress so that the workflow will progress
await env.tick();

// assert the mock was called
expect(mockHandler).toHaveBeenCalled();
```

### `resetTestSubscriptions` - clear any test subscriptions

To remove any test event subscriptions created with the `env.onEvent` method, call `env.resetTestSubscriptions()`:

```ts
env.resetTestSubscriptions();
```
