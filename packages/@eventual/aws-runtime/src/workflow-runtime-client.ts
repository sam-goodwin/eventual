import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Event } from "@eventual/core";

export interface WorkflowRuntimeClientProps {
  readonly dynamo: DynamoDBClient;
  readonly s3: S3Client;
  readonly executionHistoryBucket: string;
  readonly tableName: string;
}

export class WorkflowRuntimeClient {
  constructor(private props: WorkflowRuntimeClientProps) {}

  async getHistory(executionId: string) {
    // get current history from s3
    const historyObject = await this.props.s3.send(
      new GetObjectCommand({
        Key: formatExecutionHistoryKey(executionId),
        Bucket: this.props.executionHistoryBucket,
      })
    );

    return await historyEntryToEvents(historyObject);
  }

  // TODO: etag
  async updateHistory(executionId: string, events: Event[]) {
    const content = events.map((e) => JSON.stringify(e)).join("\n");
    // get current history from s3
    await this.props.s3.send(
      new PutObjectCommand({
        Key: formatExecutionHistoryKey(executionId),
        Bucket: this.props.executionHistoryBucket,
        Body: content,
      })
    );
  }
}

async function historyEntryToEvents(
  objectOutput: GetObjectCommandOutput
): Promise<Event[]> {
  if (objectOutput.Body) {
    return (await objectOutput.Body.transformToString())
      .split("\n")
      .map((l) => JSON.parse(l)) as Event[];
  }
  return [];
}

function formatExecutionHistoryKey(executionId: string) {
  return `executionHistory/${executionId}`;
}
