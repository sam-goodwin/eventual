import { ulid } from "ulidx";
import {
  StartWorkflowRequest,
  formatExecutionId,
  ExecutionHistoryClient,
  WorkflowClient,
  ExecutionStatus,
  WorkflowStarted,
  WorkflowEventType,
  HistoryStateEvent,
  WorkflowTask,
  Execution,
} from "@eventual/core";
import { KVNamespace, Queue } from "@cloudflare/workers-types";

export interface CFWorkflowClientProps {
  readonly kv: KVNamespace;
  readonly tableName: string;
  readonly queue: Queue;
  readonly workflowQueueUrl: string;
  readonly executionHistory: ExecutionHistoryClient;
}

export class CFWorkflowClient implements WorkflowClient {
  constructor(private props: CFWorkflowClientProps) {}

  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   * @returns
   */
  public async startWorkflow({
    executionName = ulid(),
    workflowName,
    input,
    parentExecutionId,
    seq,
  }: StartWorkflowRequest) {
    const executionId = formatExecutionId(workflowName, executionName);
    console.log("execution input:", input);

    await this.props.kv.put(
      executionId,
      JSON.stringify({
        id: executionId,
        name: executionName,
        workflowName: workflowName,
        status: ExecutionStatus.IN_PROGRESS,
        startTime: new Date().toISOString(),
        ...(parentExecutionId
          ? {
              parentExecutionId,
              seq,
            }
          : {}),
      } satisfies Execution)
    );

    const workflowStartedEvent =
      await this.props.executionHistory.createAndPutEvent<WorkflowStarted>(
        executionId,
        {
          type: WorkflowEventType.WorkflowStarted,
          input,
          workflowName,
          context: {
            name: executionName,
            parentId: parentExecutionId,
          },
        }
      );

    await this.submitWorkflowTask(executionId, workflowStartedEvent);

    return executionId;
  }

  public async submitWorkflowTask(
    executionId: string,
    ...events: HistoryStateEvent[]
  ) {
    // send workflow task to workflow queue

    await this.props.queue.send({
      task: {
        executionId,
        events,
      },
    } satisfies QueueWorkflowTaskMessage);
  }
}

export interface QueueWorkflowTaskMessage {
  task: WorkflowTask;
}
