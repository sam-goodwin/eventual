---
sidebar_position: 2
---

# Event

The Event Bus is a component within each Eventual Service that enables the decoupling of services through the use of events. Services can publish and subscribe to events without directly interacting with each other, allowing for asynchronous processing, error isolation and recovery via replay. This decoupling also enables the easy addition of new services without making changes to existing ones, helping to evolve your system over time.

## Creating an Event

You can create an event by importing the `event` function from `@eventual/core` and passing it a name for the event:

```ts
import { event } from "@eventual/core";

export const myEvent = event("MyEvent");
```

This registers an event with the name `"MyEvent"` on the Event Bus.

## Publish an Event

You can then publish data to this event by calling the publish function on the event object and passing it the data you want to send:

```ts
await myEvent.publishEvent({ message: "hello world" });
```

The function accepts multiple arguments for batch sending events.

```ts
await myEvent.publishEvent(
  {
    prop: "value 1",
  },
  {
    prop: "value 2",
  }
);
```

## Subscribe to an Event

You can subscribe to events by calling the `onEvent` function on the event object and passing it a callback function that will be called every time the event is published:

```ts
myEvent.onEvent(async (event) => {
  console.log(event);
});
```

### Supported Intrinsic Functions

The following intrinsic functions can be called within an event subscription handler:

- [`publish`](./event.md#publish-to-an-event)

```ts
await myEvent.publishEvent({ .. });
```

- [`startExecution`](./workflow.md#start-execution)

```ts
await myWorkflow.startExecution({
  input: <input payload>
})
```

- [`sendActivitySuccess`](./activity.md#sendactivitysuccess)

```ts
await myActivity.sendActivitySuccess({
  token: <token>,
  result: <result>
})
```

- [`sendActivityFailure`](./activity.md#sendactivityfailure)

```ts
await myActivity.sendActivityFailure({
  token: <token>,
  error: <error>
})
```

## Defining the type of an Event

By default, an event's type is `any`. This is easy and flexible, but also unsafe. To associate a type with an event, you can use the `<Type>` syntax when creating the event. For example:

```ts
export interface MyEvent {
  prop: string;
}

export const myEvent = event<MyEvent>("MyEvent");
```

This creates an event called `"MyEvent"` with a type of `MyEvent`. This ensures that when the event is published or subscribed to, the data adheres to the `MyEvent` interface.

```ts
await myEvent.publishEvent({
  prop: "my value", // okay
});

await myEvent.publishEvent({
  prop: 123, // error, prop must be a string
});

myEvent.onEvent((event) => {
  event.key; // error, 'key' property does not exist
});
```

By defining the type of an event, you can improve the safety and reliability of your application by catching errors at compile time rather than runtime, as well as self-documenting your code by clearly outlining the shape of the data that the event is expected to contain.

### Publish an Event from outside Eventual

To publish an event to a Service's Event Bus from outside Eventual, you will need to obtain the Event Bus's ARN. You can do this by accessing the `events.bus` property of the Service `Construct`, which is the Event Bus for the Service. For example, if you have a Service named `myService`:

```ts
const myService = new Service(..);

myService.events.bus; // <-- the Event Bus that belongs to "myService"
```

You can then provide this ARN to your external service, such as a Lambda Function, by adding it to the environment variables of the function. For example:

```ts
myFunction.addEnvironment(
  "MY_SERVICE_BUS_ARN",
  myService.events.bus.eventBusArn
);
```

Next, you will need to grant the external service permissions to publish events to the Event Bus. This can be done using the `grantPublish` method:

```ts
myService.events.grantPublish(myFunction);
```

With the necessary permissions and ARN in place, you can now use the [`PutEvents` API, provided by the AWS SDK v3 for JavaScript EventBridge Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-eventbridge/classes/puteventscommand.html)), to publish events to the Event Bus. For example:

```ts
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const client = new EventBridgeClient({});

export async function handler() {
  await client.send(
    new PutEventsCommand({
      Entries: [
        {
          DetailType: "MyEvents",
          Detail: `{ "prop": "value" }`,
          // the ARN of the Event Bus that belongs to `myService`
          EventBusName: process.env.MY_SERVICE_BUS_ARN,
        },
      ],
    })
  );
}
```

The `DetailType` property must be the name of the event, e.g. `MyEvents`:

```ts
const myEvent = event("MyEvent"); // <-- this is the DetailType
```

The `Detail` property must be a stringified JSON payload of the event's data that matches the type. For example:

```ts
interface MyEvent {
  prop: string;
}

const myEvent = event<MyEvent>("MyEvent");
```

The value of `Detail` must be a stringified JSON object with a single `prop` property with a value of type `string`. For example:

```json
{
  "prop": "value"
}
```

### Forward Events between different Services

To forward events between different services using Eventual, you will need to create a new AWS CloudWatch Events Rule. This rule will specify the source Event Bus (the one you want to send events from) and the target Event Bus (the one you want to send events to). You can then specify the `detailType` of the events you want to send, using an array of event names.

```ts
import { aws_events, aws_events_targets } from "aws-cdk-lib";

const A = new Service(..);
const B = new Service(..);

new aws_events.Rule(stack, "Rule", {
  // send from service A
  eventBus: A.events.bus,
  eventPattern: {
    // select all events with the name "MyEvent"
    detailType: ["MyEvent"]
  },
  targets: [
    // send to service B
    new aws_events_targets.EventBus(B.events.bus)
  ]
})
```

In the example above, all events with the name `"MyEvent"` will be sent from the source Event Bus of service `A` to the target Event Bus of service `B`. This allows you to easily route events between different services in your application, using the power and flexibility of AWS Event Bridge.

For more information on how to use AWS's bus-to-bus routing feature, check out this [blog post](https://aws.amazon.com/blogs/compute/using-bus-to-bus-event-routing-with-amazon-eventbridge/).
