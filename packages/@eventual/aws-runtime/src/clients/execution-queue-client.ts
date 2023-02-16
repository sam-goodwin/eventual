import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  ExecutionQueueClient,
  ExecutionQueueEventEnvelope,
  getLazy,
  LazyValue,
} from "@eventual/core-runtime";
import { HistoryResultEvent } from "@eventual/core/internal";

export interface AWSExecutionQueueClientProps {
  sqs: SQSClient;
  workflowQueueUrl: LazyValue<string>;
  baseTime?: () => Date;
}

export class AWSExecutionQueueClient extends ExecutionQueueClient {
  constructor(private props: AWSExecutionQueueClientProps) {
    super(props.baseTime ?? (() => new Date()));
  }

  public async submitExecutionEvents(
    executionId: string,
    ...events: HistoryResultEvent[]
  ) {
    // send workflow task to workflow queue
    const workflowTask: ExecutionQueueEventEnvelope = {
      task: {
        executionId,
        events,
      },
    };

    await this.props.sqs.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(workflowTask),
        QueueUrl: getLazy(this.props.workflowQueueUrl),
        MessageGroupId: executionId,
      })
    );
  }
}
