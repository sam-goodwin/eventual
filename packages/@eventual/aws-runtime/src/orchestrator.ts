// import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// import { S3Client } from "@aws-sdk/client-s3";
// import { SQSClient } from "@aws-sdk/client-sqs";
import type lambda from "aws-lambda";
// import { executionHistoryBucket, tableName } from "./env";
// import { ExecutionHistoryClient } from "./execution-history-client";
// import { WorkflowRuntimeClient } from "./workflow-runtime-client";
import { Event } from "@eventual/core";

// const s3 = new S3Client({});
// const dynamo = new DynamoDBClient({});
// const _sqs = new SQSClient({});

// const workflowRuntimeClient = new WorkflowRuntimeClient({
//   dynamo,
//   s3,
//   // todo fail when missing
//   executionHistoryBucket: executionHistoryBucket ?? "",
//   tableName: tableName ?? "",
// });
// const executionHistoryClient = new ExecutionHistoryClient({
//   dynamo,
//   tableName: tableName ?? "",
// });

/**
 * Creates an entrypoint function for orchestrating a workflow.
 */
export async function orchestrator(
  _program: (input: any) => Generator<any, any, any>
) {
  return async (_event: lambda.SQSEvent) => {
    // batch by execution id
    // for each execution id
    // load history
    // merge history with incoming events
    // generate state
    // execute workflow
    // execution commands
    // update history from new commands and events
  };
}

export async function orchestrateExecution(
  _executionId: string,
  _events: Event[]
) {
  // const history = await workflowRuntimeClient.getHistory(executionId);
  // const allEvents = [...history, ...events];
}
