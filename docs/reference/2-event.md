# Event

An Event is a record of data that can be published and subscribed to/from a Service's Event Bus. Each event has a unique name and an optional type describing the shape of the event's data.

## Creating an Event

You can create an event by importing the `event` function from `@eventual/core`:

```ts
import { event } from "@eventual/core";

export const myEvent = event("MyEvent");
```

This registers an event with the name, `MyEvent`.

## Defining the type of an Event

By default, an event's type is `any`. This is easy and flexible, but also unsafe. We recommend declaring a type/interface for each event type in your system.

To associate a type with your event, use the first type parameter when creating an event:

```ts
export interface MyEvent {
  prop: string;
}

export const myEvent = event<MyEvent>("MyEvent");
```

## Subscribe to an Event

You can subscribe to an event using the `.on` handler:

```ts
myEvent.on(async (event) => {
  console.log(event);
});
```

This handler will then be invoked whenever an event is published to this Service's Event Bus with the name, `MyEvent`.

## Publish to an Event

You can publish an event to the Service's event bus using the `.publish` method:

```ts
await myEvent.publish({
  prop: "value",
});
```

The function accepts multiple arguments for batch sending events.

```ts
await myEvent.publish(
  {
    prop: "value 1",
  },
  {
    prop: "value 2",
  }
);
```

The `.publish` API can be called from an API handler, Event handler or Activity handler:

```ts
api.post("/", async () => {
  await myEvent.publish({ .. });
});

otherEvent.on(() => {
  await myEvent.publish({ .. });
});

activity("myActivity", async () => {
  await myEvent.publish({ .. });
})
```

### Publish an Event from outside Eventual

Up until now, we've only shown how to work with events inside an Eventual's application code. It is possible to publish events to a Service from outside Eventual, for example in a Lambda Function.

Eventual's event system uses AWS Event Bridge Bus Resource. You can find this bus on the [`Service` Construct](./0-service.md):

```ts
const myService = new Service(..);

myService.events.bus; // <-- the Event Bus that belongs to "myService"
```

With this, you can then provide the ARN to your other service code, e.g. a Lambda Function:

```ts
myFunction.addEnvironment(
  "MY_SERVICE_BUS_ARN",
  myService.events.bus.eventBusArn
);
```

Then grant the `myFunction` permissions to publish events using `grantPublish`:

```ts
myService.events.grantPublish(myFunction);
```

Finally, within your `myFunction` Lambda Function, use the `PutEvents` API, e.g. with the [AWS SDK v3 for JavaScript EventBridge Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-eventbridge/classes/puteventscommand.html):

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

The `Detail` property must be a stringified JSON payload of the event's data.

### Forward Events between different Services

Because Eventual's event system uses an AWS Event Bridge Bus, it is straightforward to route events between services using [AWS's built-in bus-to-bus routing](https://aws.amazon.com/blogs/compute/using-bus-to-bus-event-routing-with-amazon-eventbridge/).

```ts
import { aws_events_targets } from "aws-cdk-lib";

const A = new Service(..);
const B = new Service(..);

new aws_events.Rule(this, "Rule", {
  // send from service A
  eventBus: A.events.bus,
  eventPattern: {
    // select all events with the name "MyEvent"
    detailType: ["MyEvent"]
  },
  targets: [
    // send to service B
    B.events.bus
  ]
})
```
