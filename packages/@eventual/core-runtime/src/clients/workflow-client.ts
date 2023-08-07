import {
  ExecutionAlreadyExists,
  ExecutionID,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  InProgressExecution,
  StartExecutionRequest,
  SucceededExecution,
  SucceedExecutionRequest,
  Workflow,
  WorkflowExecutionOptions,
} from "@eventual/core";
import {
  WorkflowEventType,
  type StartExecutionResponse,
  type WorkflowStarted,
} from "@eventual/core/internal";
import { ulid } from "ulidx";
import { inspect } from "util";
import { WorkflowSpecProvider } from "../providers/workflow-provider.js";
import { computeScheduleDate } from "../schedule.js";
import { ExecutionStore } from "../stores/execution-store.js";
import { createEvent } from "../workflow/events.js";
import {
  formatExecutionId,
  INTERNAL_EXECUTION_ID_PREFIX,
} from "../workflow/execution.js";
import { ExecutionQueueClient } from "./execution-queue-client.js";
import { LogsClient } from "./logs-client.js";
import { hashCode } from "../utils.js";

export class WorkflowClient {
  constructor(
    private executionStore: ExecutionStore,
    private logsClient: LogsClient,
    private executionQueueClient: ExecutionQueueClient,
    private workflowProvider: WorkflowSpecProvider,
    protected baseTime: () => Date = () => new Date()
  ) {}

  /**
   * Start a workflow execution
   *
   * @param name Suffix of execution id
   * @param input Workflow parameters
   */
  public async startExecution<W extends Workflow = Workflow>({
    executionName = ulid(),
    workflow,
    input,
    timeout,
    ...request
  }:
    | StartExecutionRequest<W>
    | StartChildExecutionRequest<W>): Promise<StartExecutionResponse> {
    if (
      typeof workflow === "string" &&
      !this.workflowProvider.workflowExists(workflow)
    ) {
      throw new Error(`Workflow ${workflow} does not exist in the service.`);
    }

    validateExecutionName(executionName, "parentExecutionId" in request);

    const workflowName =
      typeof workflow === "string" ? workflow : workflow.name;
    const executionId = formatExecutionId(workflowName, executionName);
    const inputHash =
      input !== undefined
        ? hashCode(JSON.stringify(input)).toString(16)
        : undefined;
    console.debug("execution input:", input);
    console.debug("execution input hash:", inputHash);

    const execution: InProgressExecution = {
      id: executionId,
      startTime: this.baseTime().toISOString(),
      workflowName,
      status: ExecutionStatus.IN_PROGRESS,
      inputHash,
      parent:
        "parentExecutionId" in request
          ? { executionId: request.parentExecutionId, seq: request.seq }
          : undefined,
    };

    try {
      const workflowStartedEvent = createEvent<WorkflowStarted>(
        {
          type: WorkflowEventType.WorkflowStarted,
          input,
          workflowName,
          // generate the time for the workflow to timeout based on when it was started.
          // the timer will be started by the orchestrator so the client does not need to have access to the timer client.
          timeoutTime: timeout
            ? computeScheduleDate(timeout, this.baseTime()).toISOString()
            : undefined,
          context: {
            name: executionName,
            parentId: execution.parent
              ? execution.parent.executionId
              : undefined,
          },
        },
        this.baseTime()
      );

      // create the log - we expect this to complete before anything tries to write to it.
      await this.logsClient.initializeExecutionLog(executionId);

      try {
        // try to create first as it may throw ExecutionAlreadyExists
        await this.executionStore.create(execution, workflowStartedEvent);
      } catch (err) {
        if (err instanceof ExecutionAlreadyExists) {
          const execution = await this.executionStore.get(executionId);
          if (execution?.inputHash === inputHash) {
            return { executionId, alreadyRunning: true };
          }
        }
        // rethrow to the top catch
        throw err;
      }

      // send the first log message and warm up the log stream
      await this.logsClient.putExecutionLogs(executionId, {
        time: this.baseTime().getTime(),
        message: "Workflow Started",
      });

      return { executionId, alreadyRunning: false };
    } catch (err) {
      console.log(err);
      throw new Error(
        "Something went wrong starting a workflow: " + inspect(err)
      );
    }
  }

  public async succeedExecution(
    request: SucceedExecutionRequest
  ): Promise<SucceededExecution> {
    const execution = await this.executionStore.update(request);
    if (execution.parent) {
      await this.reportCompletionToParent(
        execution.parent.executionId,
        execution.parent.seq,
        request.result
      );
    }

    return execution as SucceededExecution;
  }

  public async failExecution(
    request: FailExecutionRequest
  ): Promise<FailedExecution> {
    const execution = await this.executionStore.update(request);
    if (execution.parent) {
      await this.reportCompletionToParent(
        execution.parent.executionId,
        execution.parent.seq,
        request.error,
        request.message
      );
    }

    return execution as FailedExecution;
  }

  private async reportCompletionToParent(
    parentExecutionId: string,
    seq: number,
    ...args: [result: any] | [error: string, message: string]
  ) {
    await this.executionQueueClient.submitExecutionEvents(parentExecutionId, {
      seq,
      timestamp: this.baseTime().toISOString(),
      ...(args.length === 1
        ? {
            type: WorkflowEventType.ChildWorkflowSucceeded,
            result: args[0],
          }
        : {
            type: WorkflowEventType.ChildWorkflowFailed,
            error: args[0],
            message: args[1],
          }),
    });
  }
}

export interface StartChildExecutionRequest<W extends Workflow = Workflow>
  extends StartExecutionRequest<W>,
    WorkflowExecutionOptions {
  parentExecutionId: ExecutionID;
  /**
   * Sequence ID of this execution if this is a child workflow
   */
  seq: number;
}

function validateExecutionName(executionName: string, isChild: boolean) {
  if (!isChild && executionName.startsWith(INTERNAL_EXECUTION_ID_PREFIX)) {
    throw new Error(
      `Execution names may not start with ${INTERNAL_EXECUTION_ID_PREFIX}`
    );
  }
}
