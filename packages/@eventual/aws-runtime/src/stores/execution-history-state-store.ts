import {
  GetObjectCommand,
  GetObjectCommandOutput,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  ExecutionHistoryStateStore,
  getLazy,
  HistoryStateEvent,
  LazyValue,
  UpdateHistoryRequest,
} from "@eventual/core";

export interface AWSExecutionHistoryStateStoreProps {
  s3: S3Client;
  executionHistoryBucket: LazyValue<string>;
}

export class AWSExecutionHistoryStateStore
  implements ExecutionHistoryStateStore
{
  constructor(private props: AWSExecutionHistoryStateStoreProps) {}

  public async getHistory(executionId: string): Promise<HistoryStateEvent[]> {
    try {
      // get current history from s3
      const historyObject = await this.props.s3.send(
        new GetObjectCommand({
          Key: formatExecutionHistoryKey(executionId),
          Bucket: getLazy(this.props.executionHistoryBucket),
        })
      );

      return historyEntryToEvents(historyObject);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        return [];
      }
      throw err;
    }
  }

  public async updateHistory(
    request: UpdateHistoryRequest
  ): Promise<{ bytes: number }> {
    const content = request.events.map((e) => JSON.stringify(e)).join("\n");
    // get current history from s3
    await this.props.s3.send(
      new PutObjectCommand({
        Key: formatExecutionHistoryKey(request.executionId),
        Bucket: getLazy(this.props.executionHistoryBucket),
        Body: content,
      })
    );
    return { bytes: content.length };
  }
}

async function historyEntryToEvents(
  objectOutput: GetObjectCommandOutput
): Promise<HistoryStateEvent[]> {
  if (objectOutput.Body) {
    return (await objectOutput.Body.transformToString())
      .split("\n")
      .map((l) => JSON.parse(l)) as HistoryStateEvent[];
  }
  return [];
}

function formatExecutionHistoryKey(executionId: string) {
  return `executionHistory/${executionId}`;
}
