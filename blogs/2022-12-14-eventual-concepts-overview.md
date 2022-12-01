# Announcing Eventual (Part 2) - deep dive into concepts

In Part 1, we announced our new product Eventual and introduced the high level vision for a framework that enables rapid and sustainable development of distributed systems. In Part 2, we'll dive deeper into the details of how Eventual works, describe each of the concepts and show some basic code samples to give you a better idea of what is possible.

## The Service Construct

An Eventual Service is consumed as an IaC library, e.g. an AWS CDK Construct. This service brings with it an opinionated piece

```ts
new eventual.Service(this, "Service", {
  entry: "./my-service.ts",
});
```

## The 4 building blocks

To introduce Eventual, let's walk through the core primitives and how they can be used to build event-driven services:

1. Request/Response
2. Pub/Sub
3. Workflow
4. Integration

### Request/Response

First up is Request/Response - every service in the world has an API that can be called from a client. Whether that's REST, GraphQL or RPC, it doesn't matter - these are synchronous APIs that expose some functionality. Borrowing concepts from application development and recent infrastructure-from-code innovations, creating API endpoints is as simple as wiring up an ExpressJS app:

```ts
api.get("/user/:userId", async (request) => {
  return getUser(request.params.userId);
});
```

### Pub/Sub

Next is Pub/Sub - asynchronous event records that capture data about something that has happened. Events are emitted by services and subscribed to by one or many listeners who take some action in response to the event.

```ts
const checkoutCancelled = event<CheckoutCancelled>("CheckoutCancelled");

checkoutCancelled.on(async (event) => {
  await checkoutWorkflow.signal(event.executionId, "cancelled");
});
```

### Workflow Orchestration

In the event-driven world, there are two complementary concepts called **Choreography** and **Orchestration**.

Choreography is the art of juggling asynchronous events with event handlers and manual state management. For example, listening for cancelled events, updating state in a database and emitting further events indicating the cancellation succeeded. It requires meticulous understanding of distributed systems concepts such as race conditions, eventual consistency, at-least-once delivery, idempotency, etc. to perform well.

Orchestration, on the other hand, is controlled choreography using if-this-then-that state machine workflows. Instead of juggling asynchronous events, developers build state machines that perform in a consistent and reliable way.

Eventual's workflow primitive provides an abstraction for orchestration - instead of having developers manually manage these mind-bending distributed systems problems, developers can simple write functions that run as long-running, durable workflows. Eventual's powerful workflow service takes care of

### Integration

// Our philosophy is that developing quickly isn't only about getting started quickly, it's about consistent delivery and change.

// Eventual provides 4 simple building blocks that can be composed together into scalable and durable systems that are easy to observe, visualize, test and change over time.
