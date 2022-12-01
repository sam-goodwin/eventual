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

The `entry` property points to a file containing the service's business logic - that's about it, Eventual's tooling then introspects your code and deploys all required resources to the cloud automatically.

This mental model should feel eerily similar to creating an AWS Lambda Function:

```ts
new aws_lambda_nodejs.NodeJSFunction(this, "Function", {
  entry: "./my-function-handler.ts",
});
```

However, an `eventual.Service` is quite different to a simple Lambda Function. Instead of creating a single Resource, Eventual creates a fully functional Service! This includes an API Gateway, Event Bus, API and Event Handlers, and our powerful code-first Workflow Orchestrator service.

This may initially shock or worry you, but you can rest easy as all of these services scale to $0 and are almost entirely self-managed. There is no surprise impact on your cloud bill and minimal impact on your operational responsibility. You should be aware of what's under the covers, but don't be scared off by its significance - Eventual is intentionally designed for efficient operations (it's our whole thing 😉). Most cloud applications require these components anyway, so a full service implementation should actually be comparable in scope and size.

(architecture diagram)

You may have noticed that a particularly famous service is left out from this diagram - AWS Step Functions. Workflow orchestration is a key principle of Eventual but instead of using AWS Step Functions for workflows, Eventual ships with its own custom workflow engine designed to enable a code-first developer experience. Instead of authoring ASL JSON documents, workflows are written using your favorite programming language and executed by the Eventual orchestrator service. We'll get deeper into this later on - but I hope you're excited by the prospect of building entire systems using beautiful, type-safe, testable and debuggable code - context switching begone!

## The 4 building blocks

We'll now walk through the 4 foundational building blocks and how they can be used to build event-driven services.

### Request/Response

First up is Request/Response - every service in the world (pretty much) has an API that can be called from a client. Whether that's REST, GraphQL or RPC, it doesn't really matter - these are synchronous APIs that expose some functionality to users. Borrowing concepts from application development and recent infrastructure-from-code innovations, creating API endpoints is as simple as wiring up an ExpressJS app.

```ts
api.get("/user/:userId", async (request) => {
  // call the getUser integration (explained later on ...)
  return getUser(request.params.userId);
});
```

### Pub/Sub

Next is Pub/Sub - asynchronous event records that capture data about something that has happened within the business domain. Events are emitted by services and subscribed to by one or many listeners who take some action in response to the event. Wiring these up is straightforward - just declare the event and attach listeners to it.

```ts
const checkoutCancelled = event<CheckoutCancelled>("CheckoutCancelled");

checkoutCancelled.on(async (event) => {
  // send a signal to a running workflow (... see the next section for the juicy deets!)
  await checkoutWorkflow.signal(event.executionId, "cancelled");
});
```

### Workflow Orchestration

In the event-driven world, there are two complementary concepts called **Choreography** and **Orchestration**.

Choreography is the art of juggling asynchronous events with event handlers and manual state management. For example, listening for cancelled events, updating state in a database and emitting further events indicating the cancellation succeeded - we already showed this briefly in the Pub/Sub section. It's a simple enough and extremely necessary primitive but it requires meticulous understanding of distributed systems concepts such as race conditions, eventual consistency, at-least-once delivery, idempotency, etc. to do well.

Orchestration, on the other hand, is controlled choreography using if-this-then-that state machine workflows. Instead of juggling asynchronous events, developers build state machines that perform in a consistent and reliable way. This is usually achieved in AWS with a service such as AWS Step Functions which requires a DSL, but with Eventual, you get to stay within your coding environment!

Below is a contrived example of a long-running, durable workflow that orchestrates the process of charging a user's credit card and then submitting an order for delivery.

```ts
export const checkoutWorkflow = workflow("checkout", async (cart) => {
  const rollbacks = [];

  try {
    // compute the amount to charge the user
    const amount = cart.items.map((item) => item.price).reduce((a, b) => a + b);

    // call the API to charge the user's credit card
    await chargeCard({
      userId: cart.userId,
      amount,
    });

    // now that we've charged the user, register a call back to roll back this
    // charge in case of an unrecoverable failure later on
    rollbacks.push(async () =>
      chargeBack({
        userId: cart.userId,
        amount,
      })
    );

    // finally, dispatch the order for delivery
    await dispatchOrder({
      items: cart.items,
    });
  } catch (err) {
    // oops! something bad happened, if we've charged the user we should
    // roll back that transaction
    await Promise.all(rollbacks.map((rollback) => rollback()));
  }
});
```

It should look and feel almost identical to writing a Lambda Function, but this code does not run synchronously within a single Lambda Execution. It actually runs in a distributed nature using queues to ensure exactly-once-semantics that are usually only possible in a service like AWS Step Functions. Eventual's service and toolchain transforms this code into a machine that can be suspended and resumed in the cloud, enabling the development of arbitrarily long-running workflows using a programming language. The benefits of this cannot be understated!

Our philosophy is that complex orchestration is best left to code. There's no better tool for expressing complex control flow than a programming language. DSLs such as AWS Step Functions lack expressivity, are not turing complete and are an absolute pain to test. Eventual enables these workflows to be written as ordinary code that can be checked by a compiler, perform arbitrary computation and tested with standard tools and methodologies.

### Integration

The final piece of the puzzle is communicating with the outside world. What good's a service "in a box" if it's stuck in [Flat Land]()?!

You may have noticed that Eventual does not ship with a database/storage primitive and wondering why? This is because we recognize that developers have strong opinions and good reasons for choosing a database that we want no part in influencing. We'd rather leave that decision to the user.

A wider and more general concept than storage is that of an **Integration** - which we define as an interface that provides a connection to some other service or function. In simple terms, it translates to a callable function (ha). Users can write any code in here and then call the function from within APIs, Event Handlers or Workflows.

```ts
const ddb = DocumentClient.from(new DynamoDBClient({}));

const getUser = integration(
  "getUser",
  async (userId: string): Promise<User | undefined> => {
    return (
      await ddb.send(
        new GetItemCommand({
          TableName: process.env.TABLE_NAME,
          Key: {
            userId,
          },
        })
      )
    ).Item;
  }
);
```

An Integration is a named function with arbitrary logic contained within. They must be named so that they can be called from long-running workflows and to enable Eventual's built in observability and playback features.

Integrations are general purpose enough to enable the development of an open source ecosystem that accounts for Eventual's lack of a built-in storage/database primitive.

// show slack example or leave that to another blog?
