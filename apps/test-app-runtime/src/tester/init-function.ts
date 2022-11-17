import { Handler } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { InitMessage, ProgressState } from "./messages.js";

const tableName = process.env.TABLE_NAME ?? "";
const dynamo = new DynamoDBClient({});

export interface InitRequest {
  connectionId: string;
  url: string;
}

export const handler: Handler<InitRequest, void> = async (event) => {
  const inProgressesResults = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk=:pk and begins_with(sk,:sk)",
      FilterExpression: "done=:false",
      ExpressionAttributeValues: {
        ":false": { BOOL: false },
        ":sk": { S: `P#` },
        ":pk": { S: "Progress" },
      },
    })
  );

  const apig = new ApiGatewayManagementApiClient({
    endpoint: event.url,
  });

  const message: InitMessage = {
    action: "init",
    progresses:
      inProgressesResults.Items?.map(
        (p) => JSON.parse(p.state?.S ?? "{}") as ProgressState
      ) ?? [],
  };

  await apig.send(
    new PostToConnectionCommand({
      ConnectionId: event.connectionId,
      Data: Buffer.from(JSON.stringify(message)),
    })
  );
};
