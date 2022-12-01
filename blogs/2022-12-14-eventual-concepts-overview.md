# Announcing Eventual (Part 2) - deep dive into concepts

In Part 1, we announced our new product, Eventual, and introduced its vision for a framework and service that enables rapid and sustainable development of distributed systems. In Part 2, we'll dive deeper into the details of how Eventual works, describe each of the concepts and show some basic code samples to give you a better idea of what is possible.

## The `Service` Construct

Everything in Eventual starts with building a Service. I like to call it "the Box" but you can also refer to it "the Bounded Context" - pick your flavor, they're all the same. Creating a Service is as simple as importing the `@eventual/aws-cdk.Service` Construct and instantiating it within your IaC application:

```ts
import eventual from "@eventual/aws-cdk";

new eventual.Service(this, "Service", {
  entry: "./my-service.ts",
});
```

The `entry` property points the service at a file containing the service's application logic - that's about it, Eventual's tooling will introspect your code and deploy all required resource to the cloud automatically.

The mental model should feel eerily similar to creating an AWS Lambda Function:

```ts
new aws_lambda_nodejs.NodeJSFunction(this, "Function", {
  entry: "./my-function-handler.ts",
});
```

But an `eventual.Service` is quite different to a simple Lambda Function. Instead of creating a single Resource, Eventual creates a whole Service! This includes an API Gateway, Event Bus, API and Event Handlers, and our powerful code-first Workflow Orchestrator service.

This may initially shock or worry you, but you can rest easy as all of these services scale to $0 and are almost entirely self-managed. There is no impact on your cloud bill and minimal impact on your operational responsibility. You should be aware of what's under the covers, but don't be scared off by its significance - Eventual is intentionally designed for efficient operations (it's our whole thing). Most cloud applications require these components anyway, so a full service implementation should actually be comparable in scope and size.

(architecture diagram)

You may have noticed that a particularly famous service is left out from this diagram - AWS Step Functions. Workflow orchestration is a key principle of Eventual but instead of using AWS Step Functions for workflows, Eventual ships with its own custom workflow engine designed to enable a code-first developer experience. Instead of authoring ASL JSON documents, workflows are written using your favorite programming language and executed by the Eventual orchestrator service. We'll get deeper into this later on - but I hope you're excited by the prospect of building entire systems using beautiful, type-safe, testable and debuggable code!

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
