---
sidebar_position: 0.2
---

# Service Client

The `EventualServiceClient` is an interface that provides a set of methods for interacting with and managing workflow executions, sending signals, publishing events, and interacting with async activities in an Eventual Service. These methods allow external systems to communicate with and control the Eventual Service.

## APIs

### `getWorkflows`

Use `getWorkflows` to list all of the available workflows defined within the service.

```ts
const response = await client.getWorkflows();
```

The `response` contains a list of all the workflow names:

```json
{
  "workflows": [
    {
      "name": "workflow-a"
    },
    {
      "name": "workflow-b"
    }
  ]
}
```

### `startExecution`

The `startExecution` method allows you to directly start a workflow execution in the Eventual Service. It requires the `workflow` to be executed, the `input` data, and an optional `executionName`. When called, `startExecution` returns an [`ExecutionHandle`](./workflow.md#execution-handle) object that includes the `executionId` of the newly started workflow and various methods that can be used to interact with it.

```ts
const execution = await client.startExecution({
  workflow: "myWorkflow",
  input: inputData,
});
```

To specify a `workflow`, you can pass its unique name as a `string` or a reference to a `workflow` instance. For example:

```ts
const myWorkflow = workflow("myWorkflow", async() => { .. });

const execution = await client.startExecution({
  // use a reference to the workflow
  workflow: myWorkflow,
  ...
});

const execution = await client.startExecution({
  // pass the workflow's ID as a string
  workflow: "myWorkflow",
  ...
});
```

The `executionName` is an optional field you can provide to identify a particular execution of a workflow. By assigning a unique name to your execution, you can ensure that only one instance of that workflow is running at a time. If you try to start a workflow with the same name twice, the service will ignore subsequent requests.

Here's an example of how to guarantee exactly one instance of a monthly reporting workflow is running:

```ts
await client.startExecution(
  workflow: "monthlyReportWorkflow",
  input,
  name: "2023-01-01", // ensure only one workflow execution for this date exists
)
```

### `getExecution`

Use `getExecution` to get the data for an `Execution` given an `executionId`. It requires the `executionId` as its first argument and returns a JSON object containing information such as its [execution `status`](#executionstatus), `startTime` as an ISO8601 string, `workflowName` and a reference to its `parent` execution if it is a child workflow.

Here's an example of how to use getExecution to retrieve the data for an execution with the executionId of `"my-execution-id"`:

```ts
const execution = await client.getExecution("my-execution-id");
```

The returned object will have the following structure:

```json
{
  "id": "my-execution-id",
  "status": "IN_PROGRESS",
  "workflowName": "my-workflow",
  "startTime": "2023-01-01T00:00Z",
  "parent": {
    "id": "<parent-execution-id>",
    "seq": 123
  }
}
```

### `ExecutionStatus`

A workflow execution can be in one of three statuses:

- `IN_PROGRESS` - the execution is still running
- `SUCCEEDED` - the execution has completed successfully
- `FAILED` - the execution has completed unsuccessfully

### `getExecutions`

To retrieve a list of workflow executions, you can call the `getExecutions` method and pass in an options object. This object allows you to specify criteria to filter the results by.

```ts
const executions = await client.getExecutions({});
```

The method returns a JSON object containing a list of executions and an optional `nextToken`. The executions array includes information such as the `id`, `status`, `workflowName`, and `startTime` of each execution, as well as a reference to its `parent` execution (if it is a child workflow). The `nextToken` can be used in subsequent requests to page through the results if there are more executions to retrieve.

```json
{
  "nextToken": "<optional-next-token",
  "executions": [
    {
      "id": "my-execution-id",
      "status": "IN_PROGRESS",
      "workflowName": "my-workflow",
      "startTime": "2023-01-01T00:00Z",
      "parent": {
        "id": "<parent-execution-id>",
        "seq": 123
      }
    }
  ]
}
```

If `nextToken` is present in the result, you must specify it in subsequent requests to page through results:

```ts
await client.getExecutions({
  nextToken: response.nextToken,
});
```

To filter by a workflow execution's status, you can pass a list of the `statuses` you want to include in the results. For example, this call will return all executions with a status of `IN_PROGRESS`:

```ts
await client.getExecutions({
  statuses: [ExecutionStatus.IN_PROGRESS],
});
```

You can also filter by the name of the workflow the execution belongs to by passing a string value to the `workflowName` property.

```ts
await client.getExecutions({
  workflowName: "myWorkflow",
});
```

By default, the `getExecutions` method returns the first `100` results in ascending order of the execution's `startTime`. You can limit the number of results returned by specifying `maxResults` and change the order of the results by specifying `sortDirection` as "Asc" for ascending or "Desc" for descending.

```ts
await client.getExecutions({
  maxResults: 10,
  sortOrder: "Desc",
});
```

### `getExecutionHistory`

The `getExecutionHistory` method allows you to retrieve the event history log for a specific workflow execution. It requires the `executionId` of the execution you want to download the history for as its input. For example:

```ts
const history = await client.getExecutionHistory({
  executionId: "my-execution-id",
});
```

The method returns a JSON object containing the `events` and `nextToken` that can be used in subsequent requests to page through the results.

```json
{
  "events": [
    {
      "type": "WorkflowRunStarted",
      "id": "<event-id>",
      "timestamp": "2023-01-01T00:00Z"
    }
  ],
  "nextToken": "<optional next token for pagination"
}
```

See the [Workflow Events](#workflowevent) section for a list of possible event types that can occur in a workflow.

To retrieve subsequent pages of a workflow execution's history log, you can specify the `nextToken` returned in the previous response in a subsequent call to `getExecutionHistory`. This allows you to paginate through the results and retrieve the full history log of a workflow execution. For example:

```ts
const history = await client.getExecutionHistory({
  executionId: "my-execution-id",
  nextToken: response.nextToken,
});
```

By default, a single call returns `100` results, but to retrieve a specific number of results from the event history log of a workflow execution, you can use the `maxResults` option. To specify the order in which events should be returned, use the `sortDirection` option and set it to either `"Asc"` or `"Desc"`. The default value is `"Asc"`, which returns events in ascending order. For example:

```ts
const history = await client.getExecutionHistory({
  executionId: "my-execution-id",
  maxResults: 50,
  sortDirection: "Desc",
});
```

### `WorkflowEvent`

- `ActivitySucceeded`
- `ActivityFailed`
- `ActivityHeartbeatTimedOut`
- `ActivityScheduled`
- `ActivityTimedOut`
- `ChildWorkflowSucceeded`
- `ChildWorkflowFailed`
- `ChildWorkflowScheduled`
- `ConditionStarted`
- `ConditionTimedOut`
- `EventsPublished`
- `ExpectSignalStarted`
- `ExpectSignalTimedOut`
- `SignalReceived`
- `SignalSent`
- `SleepCompleted`
- `SleepScheduled`
- `WorkflowSucceeded`
- `WorkflowFailed`
- `WorkflowStarted`
- `WorkflowRunCompleted`
- `WorkflowRunStarted`
- `WorkflowTimedOut`

### `sendSignal`

Use `sendSignal` to send a [Signal](./signal.md) to a running workflow execution. It requires an `execution` to send the signal to, the `signal` to send and an optional `payload`.

Here is an example of how to use `sendSignal`:

```ts
await client.sendSignal({
  execution: "my-execution-id",
  signal: "my-signal-name",
  payload: "my-payload",
});
```

You can reference a `signal` by its unique name as a `string` like above, or pass a reference to the signal instance. For example:

```ts
const mySignal = signal("my-signal-name");

await client.sendSignal({
  execution: "my-execution-id",
  signal: mySignal,
});
```

### `publishEvents`

Use `publishEvents` to publish one or more [`Events`](./event.md) to a service. It accepts a list of `events` to publish.

```ts
await client.publishEvents({
  events: [
    {
      // the unique name of the event type
      name: "my-event-name",
      // the event payload
      event: {
        key: "value",
        // ..
      },
    },
  ],
});
```

### `sendActivitySuccess`

The `sendActivitySuccess` method is used to mark an [async activity](./activity.md#async-activity) as successfully completed. This is done by providing the `activityToken` and the `result` of the activity. This method is typically called after the activity has been performed and the result has been computed.

```ts
await client.sendActivitySuccess({
  activityToken: "my-token",
  result: "result payload",
});
```

### `sendActivityFailure`

The `sendActivityFailure` method is used to mark an asynchronous activity as failed. This is done by providing the `activityToken` and the `error` that caused the failure. This method is typically called when an error occurs during the performance of the activity.

```ts
await client.sendActivityFailure({
  activityToken: token,
  error: new Error("failure"),
});
```

### `sendActivityHeartbeat`

The `sendActivityHeartbeat` method is used to send a [Heartbeat](./activity.md#heartbeat) indicating that the activity is still being actively worked on. It requires the `activityToken: string;` of the activity request that is being processed.

```ts
await client.sendActivityHeartbeat({
  activityToken: "<activity-token>",
});
```

See the [Heartbeat Documentation](./activity.md#heartbeat) for more information on asynchronous activity heartbeats.

## Implementations

There are several implementations of the `EventualServiceClient` interface that are useful in different runtime contexts:

### `HttpServiceClient`

The `HttpServiceClient` is an HTTP implementation available in `@eventual/client` that allows you to make unauthenticated and unsigned requests to the API deployed with an Eventual Service using fetch. It is the base client for interacting with an Eventual Service over HTTP from outside of a managed Eventual environment.

To authorize and/or sign requests, you can use the `beforeRequest` hook or an existing platform-specific client, such as the [`AwsHttpServiceClient`](#awshttpserviceclient) in `@eventual/aws-client`.

Here is an example of how to use the `HttpServiceClient`:

```ts
const client = new HttpServiceClient({
  serviceUrl: "<http-service-url>",
});

const workflows = await client.getWorkflows();
```

### `AwsHttpServiceClient`

The `AwsHttpServiceClient` is an AWS-specific HTTP implementation that allows you to make authorized and signed requests to API Gateway using the credentials provided on construction. This client is available in `@eventual/aws-client`.

```
npm install --save @eventual/aws-client
```

Use this client if you're running within an AWS environment and wish to authenticate with your Eventual Service using AWS IAM.

Here's an example of how to create and used an `AwsHttpServiceClient`:

```ts
const client = new AwsHttpServiceClient({
  serviceUrl: "<http-service-url>",
});

const workflows = await client.getWorkflows();
```

The client uses your default credential chain by default, which should "just work" when running from within an environment such as an AWS Lambda Function. To override this behavior, specify the `credentials` when creating the client. You can pass any valid [`AwsCredentialIdentity`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/interfaces/_aws_sdk_types.awscredentialidentity-2.html) or [`AwsCredentialIdentityProvider`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_types.html#awscredentialidentityprovider-2).

```ts
const client = new AwsHttpServiceClient({
  serviceUrl: "<http-service-url>",
  credentials: myCredentials,
});
```

### `RuntimeServiceClient`

The `RuntimeServiceClient` available in `@eventual/core` is an implementation that uses the Eventual runtime clients. It is intended to be used when there is direct access to the internals of an Eventual Service - this is true only when inside API, event or activity handler functions. This client has the advantaged of being more performant by avoiding the hop over HTTP but requires privileged access to service internals.

To get an instance of this client, call the global `getServiceClient` from `@eventual/core` when within an API, event or activity handler function.

```ts
import { getServiceClient } from "@eventual/core";

const client = getServiceClient();
```

### `TestEnvironment`

The `TestEnvironment` is a locally simulated workflow environment designed for unit testing, available in the `@eventual/testing` package. It implements a local and mockable version of the EventualServiceClient interface, allowing you to provide mock implementations of activities and workflows, manually progress time, and more.

See the [Unit Testing](./unit-testing.md#testenvironment) docs.
