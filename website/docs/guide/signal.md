---
sidebar_position: 5.1
---

# Signal

A Signal is a message that can be sent into a running workflow execution. The workflow can use signals to wait for input from an external system, for example waiting for another service to send a signal indicating a user has confirmed/denied a request.

Signals are a point-to-point communication mechanism, which is different than an [Event](./event.md) which are broadcasted by publishers to subscribers.

## Create a Signal

To create a Signal, import and call the `signal` function available in `@eventual/core`

```ts
import { signal } from "@eventual/core";

const mySignal = signal("signal-name");
```

## Specify a Signal's payload type

Signals can have payloads. To specify a Signal's type, use the `<Type>` syntax when creating it:

```ts
const mySignal = signal<boolean>("isConfirmed");
```

## Send a Signal to a running execution

To send a Signal to a running workflow execution, you need its `executionId`:

Using an `executionId`, you can call the `sendSignal` method on a Signal instance, passing the `executionId` and optional `payload`:

```ts
await mySignal.sendSignal({
  executionId: "my-execution-id",
  payload: true,
});
```

Also see the [ExecutionHandle.sendSignal](./workflow.md#send-a-signal-to-a-running-execution) and [EventualServiceClient.sendSignal](./service-client#sendsignal) documentation for alternative methods of sending a signal.

## Wait for a Signal in a Workflow

See the [Workflow Documentation](./workflow.md#wait-for-a-signal).
