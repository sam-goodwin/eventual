import { SQSHandler, SQSRecord } from "aws-lambda";
import { S3 } from "@aws-sdk/client-s3";
import { DynamoDB } from "@aws-sdk/client-dynamodb";

const s3 = new S3({});
const dynamo = new DynamoDB({});

// TODO abstract to a workflow function in aws-runtime.
export const workflow: SQSHandler = async (event) => {
  if (event.Records.some((r) => !!r.attributes.MessageGroupId)) {
    throw new Error("Expected SQS Records to contain fifo message id");
  }

  const eventsByExecutionId = event.Records.reduce(
    (obj: Record<string, SQSRecord[]>, r) => ({
      ...obj,
      [r.attributes.MessageGroupId!]: [
        ...(obj[r.attributes.MessageGroupId!] || []),
        r,
      ],
    }),
    {}
  );

  const executionIds = Object.keys(eventsByExecutionId);

  console.log("Found execution ids: " + executionIds.join(", "));

  await Promise.all(
    Object.entries(eventsByExecutionId).map(async ([executionId, records]) =>
      handleExecutionEvents(executionId, sqsRecordsToEvents(records))
    )
  );
};

function sqsRecordsToEvents(sqsRecords: SQSRecord[]): WorkflowEvent[] {
  return sqsRecords.flatMagit statusp(sqsRecordToEvents);
}

function sqsRecordToEvents(sqsRecord: SQSRecord): WorkflowEvent[] {
  const message = JSON.parse(sqsRecord.body) as SQSWorkflowEventMessage;

  return message.events;
}

async function handleExecutionEvents(
  executionId: string,
  events: WorkflowEvent[]
) {
    // get current history from s3
    // invoke workflow
    // evaluate the workflow result, execute commands,  
}

interface WorkflowEvent {}
interface SQSWorkflowEventMessage {
  events: WorkflowEvent[];
}
