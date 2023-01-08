---
sidebar_position: 0
---

# Service

An Eventual Service is a composable and evolvable building block that is fundamentally asynchronous and event-driven. It consists of an API Gateway, an Event Bus, and Workflows. The API Gateway is responsible for exposing your business logic through an HTTP REST API, while the Event Bus enables the decoupling of services through the publication and subscription of events. The Workflows execute your business logic and can be triggered by events or API requests. Together, these components enable you to build and deploy scalable, maintainable, and resilient distributed systems in the cloud.

![Service Building Blocks](../service-diagram.png)

## Service Construct

A `Service` can be created with the AWS CDK Construct available in [`@eventual/aws-cdk`](https://www.npmjs.com/package/@eventual/aws-cdk).

```ts
const service = new Service(stack, "Service", {
  entry: path.resolve("services", "functions", "my-service.ts"),
});
```

## Business Logic

The `entry` property points to the entrypoint `.ts` or `.js` file that contains the application logic for your service. A service's application logic is implemented using the 4 building blocks:

1. [API](./api.md)
2. [Events](./event.md)
3. [Workflows](./workflow.md)
4. [Activity](./activity.md)

## Scaling Limits

For information on how to scale a Service in AWS, see [Service Scaling Limits](./service-scaling-limits.md).

## Service Name

Services are named to make them easier to identify and reference. By default, a service's name is the CDK Construct's address, which is unique within a single AWS account and region, but may not be very user-friendly. We recommend naming your services in a consistent way that aligns with your organization.

```ts
const service = new Service(stack, "Service", {
  name: "cart-service-prod",
  entry: path.resolve("services", "functions", "my-service.ts"),
});
```

The names of your service are important when using the `eventual` CLI, for example when listing the services in an AWS account:

```
> eventual list services
cart-service-prod
payment-service-prod
```

Or when invoking a workflow:

```
> eventual start workflow checkout --inputFile ./input.json
```

For more information on how to use the CLI, see the [docs](./cli.md).

## Environment Variables

You can set environment variables on the Service using the environment property. These variables will be available to the `api`, `event`, `activity` and `workflow` handlers. For example, you can make a DynamoDB Table's ARN available like this:

```ts
const service = new Service(stack, "Service", {
  entry: path.resolve("services", "functions", "my-service.ts"),
  environment: {
    TABLE_ARN: table.tableArn,
  },
});
```

## Grant Permissions

The `Service` Construct implement `IGrantable` and can therefore be granted permissions using standard "grant" methods in the CDK. For example, granting read/write permissions to a DynamoDB Table:

```ts
table.grantReadWriteData(service);
```

The `api`, `event` and `activity` handler's IAM Roles will now have access to read/write to that DynamoDB Table.

## System Architecture

An Eventual Service provisions a fully serverless architecture that includes an API Gateway, an Event Bus, and a Workflow Engine made up of a SQS FIFO Queue, an S3 Bucket, a DynamoDB Table, and a Scheduler API. These components are connected and managed by Lambda Functions that contain your business logic and are bundled with the `@eventual/aws-runtime` library, which controls execution and provides services to your code. These Lambda Functions use managed event source subscriptions to trigger and orchestrate the various pieces of the architecture, making it easy to maintain and operate.

![Service Architecture](./service.png)
