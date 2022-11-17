import { activity, eventual } from "@eventual/core";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({});
const apig = new ApiGatewayManagementApiClient({
  endpoint: "https://nklz9hg986.execute-api.us-east-1.amazonaws.com/dev",
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

export default eventual(async (request: Request) => {
  const defaults: Props = {
    delaySeconds: 1,
    goal: 100,
    reportInterval: 1,
    start: 0,
    step: 1,
  };

  const props: Props = {
    ...defaults,
    ...request,
  };

  let value = props.start;
  let nextReportValue = value + props.reportInterval;

  while (value < props.goal) {
    if (value >= nextReportValue) {
      nextReportValue = value + props.reportInterval;
      report(value / (props.goal * 1.0), value, false);
    }

    await delay(props.delaySeconds);

    value = value + props.step;
  }

  await report(1, value, true);

  return "DONE";
});

const report = activity(
  "report",
  async (progress: number, value: number, done: boolean) => {
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
            Data: Buffer.from(JSON.stringify({ progress, value, done })),
          })
        )
      )
    );
  }
);

const delay = activity("delay", async (seconds: number) => {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
});
