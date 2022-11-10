import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  Event,
  WorkflowEvent as WorkflowTask,
  WorkflowStartedEvent,
} from "@eventual/core";
import { ulid } from "ulid";
import { ExecutionHistoryClient } from "./execution-history-client.js";

export interface WorkflowClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
  readonly sqs: SQSClient;
  readonly workflowQueueUrl: string;
  readonly executionHistory: ExecutionHistoryClient;
}

export class WorkflowClient {
  constructor(private props: WorkflowClientProps) {}

  public async startWorkflow(name: string, input: any) {
    const executionId = `execution_${name ? name : ulid()}`;

    await this.props.dynamo.send(
      new PutItemCommand({
        Item: {
          pk: { S: "Execution" },
          sk: { S: `Execution$${executionId}` },
          id: { S: executionId },
          status: { S: "Started" },
        },
        TableName: this.props.tableName,
      })
    );

    const workflowStartedEvent =
      await this.props.executionHistory.putEvent<WorkflowStartedEvent>(
        executionId,
        {
          type: "WorkflowStartedEvent",
          input,
        }
      );

    await this.submitWorkflowTask(executionId, workflowStartedEvent);

    return executionId;
  }

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
        MessageGroupId: executionId,
        // just de-dupe with itself
        MessageDeduplicationId: `${executionId}_${ulid()}`,
      })
    );
  }
}

export interface SQSWorkflowTaskMessage {
  executionId: string;
  event: WorkflowTask;
}
