import { activity, eventual } from "@eventual/core";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { ulid } from "ulid";
import { ProgressState } from "./messages.js";

const dynamo = new DynamoDBClient({});
const apig = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_URL,
});
const tableName = process.env.TABLE_NAME;

interface Props {
  /**
   * Start value.
   *
   * Default: 0.
   */
  start: number;
  /**
   * Value to increase by on each interval.
   *
   * Default: 1.
   */
  step: number;
  /**
   * Will report progress each time the current value passes the next interval.
   *
   * Default: 1.
   */
  reportInterval: number;
  /**
   * Value at which the progress is considered 100% complete.
   *
   * Default: 100.
   */
  goal: number;
  /**
   * Delay seconds between each step.
   *
   * Default: 1s.
   */
  delaySeconds: number;
}

export type Request = Partial<Props>;

const defaults: Props = {
  delaySeconds: 1,
  goal: 100,
  reportInterval: 1,
  start: 0,
  step: 1,
};

export default eventual(async (request: Request) => {
  // TODO create random value or reference execution id
  const id = await getId();

  const props: Props = {
    ...defaults,
    ...request,
  };

  let value = props.start;
  let nextReportValue = value + props.reportInterval;

  persist({ done: false, goal: props.goal, id, value });

  while (value < props.goal) {
    if (value >= nextReportValue) {
      nextReportValue = value + props.reportInterval;
      // TODO: get the execution id;
      const progressState = { done: false, goal: props.goal, value, id };
      persist(progressState);
      report(progressState);
    }

    await delay(props.delaySeconds);

    value = value + props.step;
  }

  const progressState = { done: true, goal: props.goal, value, id };
  await Promise.all([persist(progressState), report(progressState)]);

  return "DONE";
});

const report = activity("report", async (progress: ProgressState) => {
  const connectionsResults = await dynamo.send(
    new QueryCommand({
      KeyConditionExpression: "pk=:pk and begins_with(sk,:sk)",
      ExpressionAttributeValues: {
        ":pk": { S: "Connection" },
        ":sk": { S: "C#" },
      },
      TableName: tableName,
    })
  );

  const connections =
    connectionsResults.Items?.map((s) => s.connectionId?.S).filter(
      (s): s is string => !!s
    ) ?? [];

  console.log("Reporting to " + connections.join(","));

  await Promise.allSettled(
    connections.map((c) =>
      apig.send(
        new PostToConnectionCommand({
          ConnectionId: c,
          Data: Buffer.from(
            JSON.stringify({ action: "progressUpdate", progress })
          ),
        })
      )
    )
  );
});

const persist = activity("persist", async (progress: ProgressState) => {
  await dynamo.send(
    new PutItemCommand({
      Item: {
        pk: { S: "Progress" },
        sk: { S: `P#${progress.id}` },
        state: { S: JSON.stringify(progress) },
        done: { BOOL: progress.done },
      },
      TableName: tableName,
    })
  );
});

const delay = activity("delay", async (seconds: number) => {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
});

const getId = activity("getId", () => {
  return ulid();
});
