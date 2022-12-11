import {
  AWSActivityRuntimeClient,
  AWSExecutionHistoryClient,
  AWSWorkflowClient,
} from "@eventual/aws-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { activityTableName, queueUrl, tableName } from "./env.js";

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
  activityRuntimeClient: new AWSActivityRuntimeClient({
    dynamo,
    activityTableName: activityTableName(),
  }),
});
