import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Event, WorkflowEvent as WorkflowTask } from "@eventual/core";

export interface WorkflowClientProps {
  readonly sqs: SQSClient;
  readonly workflowQueueUrl: string;
}

export class WorkflowClient {
  constructor(private props: WorkflowClientProps) {}

  public async submitWorkflowTask(executionId: string, ...events: Event[]) {
    // send workflow task to workflow queue
    const workflowTask: SQSWorkflowTaskMessage = {
      executionId,
      event: {
        events: events,
      },
    };

    await this.props.sqs.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(workflowTask),
        QueueUrl: this.props.workflowQueueUrl,
      })
    );
  }
}

export interface SQSWorkflowTaskMessage {
  executionId: string;
  event: WorkflowTask;
}
