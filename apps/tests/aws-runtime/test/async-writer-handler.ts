import {
  AWSActivityRuntimeClient,
  AWSWorkflowClient,
} from "@eventual/aws-runtime";
import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";

const dynamo = new DynamoDBClient({});

const workflowClient = new AWSWorkflowClient({
  dynamo,
  sqs: new SQSClient({}),
  tableName: process.env.TEST_TABLE_NAME || "",
  workflowQueueUrl: process.env.TEST_QUEUE_URL || "",
  activityRuntimeClient: new AWSActivityRuntimeClient({
    activityTableName: process.env.TEST_ACTIVITY_TABLE_NAME || "",
    dynamo,
  }),
});

export interface AsyncWriterTestEvent {
  type: "complete" | "fail";
  token: string;
  ingestionTime: string;
}

export const handle: Handler<AsyncWriterTestEvent[], void> = async (event) => {
  console.log(event);
  console.log(
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
    )
  );
};
