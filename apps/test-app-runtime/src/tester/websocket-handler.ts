import { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { ExecutionHistoryClient, WorkflowClient } from "@eventual/aws-runtime";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { InitRequest } from "./init-function.js";

const tableName = process.env.TABLE_NAME ?? "";
const workflowTable = process.env.WORKFLOW_TABLE ?? "";
const dynamo = new DynamoDBClient({});
const sqs = new SQSClient({});
const workflowQueueUrl = process.env.WORKFLOW_QUEUE_URL ?? "";
const lambda = new LambdaClient({});
const initFunctionName = process.env.INIT_FUNCTION_NAME;

const workflowClient = new WorkflowClient({
  dynamo,
  executionHistory: new ExecutionHistoryClient({
    dynamo,
    tableName: workflowTable,
  }),
  sqs,
  tableName: workflowTable,
  workflowQueueUrl,
});

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  console.log(JSON.stringify(event, null, 2));

  const {
    requestContext: { connectionId, routeKey },
  } = event;

  if (routeKey === "$connect") {
    await dynamo.send(
      new PutItemCommand({
        Item: {
          pk: { S: "Connection" },
          sk: { S: `C#${connectionId}` },
          connectionId: { S: connectionId },
        },
        TableName: tableName,
      })
    );

    const initRequest: InitRequest = {
      connectionId,
      url: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
    };

    await lambda.send(
      new InvokeCommand({
        FunctionName: initFunctionName,
        InvocationType: InvocationType.Event,
        Payload: Buffer.from(JSON.stringify(initRequest)),
      })
    );

    return {
      statusCode: 200,
    };
  } else if (routeKey === "$disconnect") {
    await dynamo.send(
      new DeleteItemCommand({
        Key: {
          pk: { S: "Connection" },
          sk: { S: `C#${connectionId}` },
        },
        TableName: tableName,
      })
    );

    return {
      statusCode: 200,
    };
  }

  if (routeKey === "$default") {
    console.log(event.body);

    if (!event.body) {
      throw new Error("No body!");
    }

    const request: Request = JSON.parse(event.body);

    const started = await workflowClient.startWorkflow(request);

    return {
      body: JSON.stringify({ id: started }),
      statusCode: 200,
    };
  }

  throw new Error("Unknown route key: " + routeKey);
};
