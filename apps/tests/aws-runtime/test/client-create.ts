import {
  AWSExecutionHistoryClient,
  AWSWorkflowClient,
} from "@eventual/aws-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import { SQSClient } from "@aws-sdk/client-sqs";
import { queueUrl, tableName, testArn } from "./env.js";

const creds = fromTemporaryCredentials({
  params: { RoleArn: testArn() },
});

const dynamo = new DynamoDBClient({ credentials: creds });

export const workflowClient = new AWSWorkflowClient({
  dynamo,
  sqs: new SQSClient({ credentials: creds }),
  executionHistory: new AWSExecutionHistoryClient({
    dynamo,
    tableName: tableName(),
  }),
  tableName: tableName(),
  workflowQueueUrl: queueUrl(),
});
