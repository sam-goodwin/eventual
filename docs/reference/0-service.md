# Service

A Service consists of an API, an Event Bus and Workflows.

![Service Architecture](./0-service.png)

## Service Construct

A `Service` can be created with the AWS CDK Construct available in [`@eventual/aws-cdk`](https://www.npmjs.com/package/@eventual/aws-cdk).

```ts
const service = new Service(stack, "Service", {
  entry: path.resolve("services", "functions", "my-service.ts"),
});
```

The only required property is `entry`, which points at the entrypoint `.ts` or `.js` file that contains the application logic for your service. A service's application logic is implemented using the 4 building blocks:

1. [API](./1-api.md)
2. [Events](./2-event.md)
3. [Workflows](./3-workflow.md)
4. [Activity](./4-activity.md)

## Service Name

Services are named. By default, a service's name is the CDK Construct's address which is not particularly friendly but is guaranteed to be unique within a single AWS account and region. We recommend naming your services in a consistent way that aligns with your organization.

```ts
const service = new Service(stack, "Service", {
  name: "cart-service-prod",
  entry: path.resolve("services", "functions", "my-service.ts"),
});
```

The names of your service are important when using the `eventual` CLI, for example when listing the services in an AWS account:

```
> eventual services
cart-service-prod
payment-service-prod
```

Or when invoking a workflow:

```
> eventual start cart-service-prod checkout ./input.json
```

For more information on how to use the CLI, see the [docs](./5-cli.md).

## Environment Variables

You can set environment variables on the Service using the `environment` property. For example, making a DynamoDB Table's ARN available

```ts
const service = new Service(stack, "Service", {
  entry: path.resolve("services", "functions", "my-service.ts"),
  environment: {
    TABLE_ARN: table.tableArn,
  },
});
```

These environment variables will then be available to the `api`, `event`, `activity` and `workflow` handlers.

## Grant Permissions

The `Service` Construct implement `IGrantable` and can therefore be granted permissions using standard "grant" methods in the CDK. For example, granting read/write permissions to a DynamoDB Table:

```ts
table.grantReadWriteData(service);
```

The `api`, `event` and `activity` handler's IAM Roles will now have access to read/write to that DynamoDB Table.
