# Workflow

Workflows are used to orchestrate business logic by calling APIs, coordinating time and interacting with humans and other services. They are they glue that connects APIs, events, time and integrations.

## Create a `workflow`

To create a workflow, import and call the `workflow` function from `@eventual/core`. Each workflow is given a name that must be unique within the service and an implementation as an asynchronous function.

```ts
import { workflow } from "@eventual/core";

const myWorkflow = workflow("myWorkflow", async (input: any) => {
  // implementation
});
```

## Call an Activity

A workflow can call activities directly:

```ts
const myWorkflow = workflow("myWorkflow", async (input: any) => {
  const message = await myActivity();
});

const myActivity = activity("myActivity", async () => {
  return "hello world";
});
```

Activities are how workflow perform work

## Runtime Semantics

A workflow function is a program that executes in a durable, long-running manner. It differs from API/event/activity handlers, which are invoked for a single execution and do not have the same runtime guarantees.

To carry out an activity, the workflow function enqueues a message on an internal message bus. A worker listening to that queue then performs the activity and sends a message back to the workflow function with the result. This process, known as the actor pattern, allows the workflow to execute operations in a reliable manner, as each operation is guaranteed to be executed exactly once, even in the event of intermittent failures.

The use of an internal message bus and worker process helps to eliminate the risk of failure inherent in single-invocation runtimes such as Lambda functions or containers, which can crash, time out, or reboot at any time. By contrast, a workflow function is able to continue executing and resuming even in the face of such failures, making it a more durable and reliable runtime for long-running processes.

## Event Sourcing and Re-entrancy

Event sourcing and re-entrancy are two techniques that allow a workflow function to execute in a durable, long-running manner.

Event sourcing involves recording every action taken within a workflow, such as executing an activity or waiting for a signal, as an event in the workflow's event log. This log is then used to replay the workflow's execution whenever a decision needs to be made, a process known as re-entrancy.

During replay, the workflow function processes each event in the log in order. If an event has already been recorded in the log, it is skipped over as it is considered to have already been performed. If an event has not been recorded, it is enqueued for execution and the workflow function suspends until it is completed. This ensures that each action taken by the workflow is performed exactly once, even in the face of intermittent failures.

By using event sourcing and re-entrancy, a workflow function is able to provide strong runtime guarantees and execute in a reliable manner, making it a suitable runtime for long-running processes.

## Deterministic Constraints

A consequence of the event sourcing and re-entrant techniques is that a workflow function's logic must be deterministic and backwards compatible.

This means that any operation that could produce different results each time it is called, such as generating a UUID or random number, accessing a database, or getting the system time, must be performed via an activity rather than being called directly within the workflow.

```ts
workflow("foo", async () => {
  // the following operations are not deterministic and should be instead wrapped in an activity
  const id = uuid();
  const time = new Date();
  await fetch("http://google.com");
});
```

When making changes to a workflow function and redeploying it, it is important to ensure that those changes are backwards compatible with already-running executions. This means that the order of operations should not be changed and no operations should be removed.

For example, imagine a workflow that calls two activities in sequence, `bar` and then `baz`:

```ts
workflow("foo", async () => {
  await bar();
  await baz();
});
```

The following change is valid because the order in which they execute is un-changed:

```ts
await Promise.all([bar(), baz()]);
```

But re-arranging the order is invalid:

```ts
await baz();
await bar();
```

Removing one of the calls is also invalid:

```ts
await baz();
```

## Syntax Constraints

Any syntax, such as if-else, while, functions, etc. are supported.

### Everything must be defined inside the workflow closure

Tracking: https://github.com/functionless/eventual/issues/146

The only constraint is that the workflow's logic must be entirely encapsulated within the closure - you cannot call an `async function` that is defined outside of the `workflow`.

```ts
workflow("myWorkflow", async () => {
  // not allowed
  await foo();
});

// to call this from a workflow, it must be
async function foo() {}
```
