import {
  AWSExecutionHistoryClient,
  AWSWorkflowClient,
} from "@eventual/aws-runtime";
import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";

const dynamo = new DynamoDBClient({});

const workflowClient = new AWSWorkflowClient({
  dynamo,
  sqs: new SQSClient({}),
  executionHistory: new AWSExecutionHistoryClient({
    dynamo,
    tableName: process.env.TEST_TABLE_NAME || "",
  }),
  tableName: process.env.TEST_TABLE_NAME || "",
  workflowQueueUrl: process.env.TEST_QUEUE_URL || "",
});

export interface AsyncWriterFunction {
  type: "complete" | "fail";
  token: string;
  ingestionTime: string;
}

export const handle: Handler<AsyncWriterFunction[], void> = async (event) => {
  console.log(event);
  await Promise.allSettled(
    event.map(async (e) => {
      if (e.type === "complete") {
        await workflowClient.completeActivity({
          activityToken: e.token,
          result: "hello from the async writer!",
        });
      } else {
        await workflowClient.failActivity({
          activityToken: e.token,
          error: "AsyncWriterError",
          message: "I was told to fail this activity, sorry.",
        });
      }
    })
  );
};
