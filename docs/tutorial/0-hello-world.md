# Tutorial - Hello World

In this tutorial, we'll build a simple hello world application with Eventual that defines an API that publishes greeting messages to the Service Bus using a long-running Workflow.

Steps you'll take in this tutorial:

1. implement an Activity for formatting messages
2. register an Event on the Service Bus
3. implement a Workflow that calls an Activity and publishes an Event
4. implement an API route for `POST /hello` that triggers the workflow via HTTP

## Implement an `activity` function

Activities are where business logic is implemented, such as expensive computations or interacting with databases and other services. As this is just a hello world tutorial, we'll simply create a function that formats a greeting message when given someone's name.

Activities are created using the `activity` function from `@eventual/core`.

```ts
import { activity } from "@eventual/core";

const greeter = activity("greeter", async (name: string) => {
  return `hello ${name}`;
});
```

It accepts two arguments: 1) a unique name identifying the activity and 2) a function that implements the activity's business logic. Our activity is called `"greeter"` and it simply formats a message when given a name string.

## Create an `event` type

Every service has its own Event Bus that we can Publish and Subscribe events to. To register a new Event type on this bus, use the `event` function in `@eventual/core`.

```ts
import { event } from "@eventual/core";

const helloEvent = event<string>("helloEvent");
```

The `event` function accepts a single argument for the event's unique name and one type parameter defining the structure of the event payload. Our event is called `"helloEvent"` and its payload is a simple `string`.

## Subscribe to `helloEvent`

After registering an Event type, you can then subscribe to those events using the `.on` function.

```ts
helloEvent.on((data) => {
  console.log(data.message);
});
```

This handler will be invoked anytime a `helloEvent` event is published and our example will simply log each message to the console.

## Implement a `workflow` function

A `workflow` function is useful for implementing asynchronous, long-running, durable processes.

Similar to activities, workflows are given a unique name and implemented with a handler function.

To create a workflow, import `workflow` from `@eventual/core` and

```ts
import { workflow } from "@eventual/core";

const hello = workflow("hello", async (name: string) => {
  const message = await greeter(name);

  await helloEvent.publish(message);
});
```

Let's break down the steps of this workflow line by line.

The first line calls the `greeter` activity which returns the formatted greeting `message` as a string.

```ts
const message = await greeter(name);
```

Next, we publish that message to the `helloEvent` Event using the `.publish` function:

```ts
await helloEvent.publish(message);
```

### Workflow are special ...

Pretty basic, right? Well, not really ...

While this may look like a call to a direct function, there's actually a lot going on behind the scenes that is important to understand.

You see, workflows are not ordinary serverless functions - they're what we call "durable" and "long running".

Calling an activity from within a workflow (such as `greeter`) does not invoke it directly - instead, a message is enqueued and another function (called the "Activity Worker") does the work asynchronously.

During this time, your workflow will "suspend" and wait for the worker to complete its execution and send back the result. Only when this result is received does the workflow "wake back up" and resume its execution.

You may be thinking that this seems like a waste of time and resources - why not just invoke it directly?! Activities are invoked asynchronously for two primary reasons:

1. workflows are arbitrarily long-running and cannot complete within a single execution of a serverless function.
2. workflow steps have exactly-once semantics, meaning you are guaranteed that when you call `greeter` that it will only ever be invoked once.

For more information see the [Workflow API Reference](../reference/3-workflow.md) or the [Managing Determinism Tutorial](./2-managing-determinism.md).

## Create an API route

Finally, we'll bring everything together by exposing a REST API that triggers the `hello` workflow.

First, import `api` from `@eventual/core`:

```ts
import { api } from "@eventual/core";
```

Then, register a single route for `POST /hello` by calling the `post` function. This function accepts two arguments:

1. a string defining the route, `"/hello"`
2. a handler function for processing API requests

```ts
api.post("/hello", async (request) => {
  const name = await request.text();

  const { executionId } = await hello.startExecution({
    input: name,
  });

  return new Response(executionId, {
    status: 200,
  });
});
```

This handler function is passed a `Request` object and must return a `Response` object. Let's break down each line in this function.

First, we parse the Request's body as plain text using the `.text()` utility available on the Request object:

```ts
const name = await request.json();
```

Next, an execution of the `hello` workflow is started by calling `startExecution`. This will begin an execution of that workflow and return us a response containing the `executionId`.

```ts
const response = await hello.startExecution({
  input: name,
});
```

Finally, a `Response` is returned with a status code of 200 and a response body containing the `executionId` of the newly started workflow.

```ts
return new Response(executionId, {
  status: 200,
});
```
