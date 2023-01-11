import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const tableName = process.env.TABLE_NAME!;
