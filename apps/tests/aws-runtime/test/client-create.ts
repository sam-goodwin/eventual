import {
  AWSExecutionHistoryClient,
  AWSWorkflowClient,
} from "@eventual/aws-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { queueUrl, tableName } from "./env.js";

const dynamo = new DynamoDBClient({});

export const workflowClient = new AWSWorkflowClient({
  dynamo,
  sqs: new SQSClient({}),
  executionHistory: new AWSExecutionHistoryClient({
    dynamo,
    tableName: tableName(),
  }),
  tableName: tableName(),
  workflowQueueUrl: queueUrl(),
});
