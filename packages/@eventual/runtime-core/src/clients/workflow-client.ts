import {
  createEvent,
  ExecutionAlreadyExists,
  ExecutionID,
  ExecutionParent,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  formatExecutionId,
  hashCode,
  InProgressExecution,
  INTERNAL_EXECUTION_ID_PREFIX,
  StartExecutionRequest,
  StartExecutionResponse,
  SucceededExecution,
  SucceedExecutionRequest,
  Workflow,
  WorkflowEventType,
  WorkflowOptions,
  WorkflowStarted,
} from "@eventual/core";
import { ulid } from "ulidx";
import { inspect } from "util";
import { WorkflowSpecProvider } from "../providers/workflow-provider.js";
import { computeScheduleDate } from "../schedule.js";
import { ExecutionStore, UpdateEvent } from "../stores/execution-store.js";
import { LogsClient } from "./logs-client.js";

export class WorkflowClient {
  constructor(
    private executionStore: ExecutionStore,
    private logsClient: LogsClient,
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
      typeof workflow === "string" ? workflow : workflow.workflowName;
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

      // create the log
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
    const execution = await this.executionStore.get(request.executionId);
    if (!execution) {
      throw new Error("Execution does not exist");
    }

    const parentChildEvent = execution.parent
      ? this.reportCompletionToParentEvent(execution.parent, request.result)
      : undefined;

    await this.executionStore.update(request, parentChildEvent);

    return {
      ...execution,
      result: request.result,
      endTime: request.endTime,
      status: ExecutionStatus.SUCCEEDED,
    };
  }

  public async failExecution(
    request: FailExecutionRequest
  ): Promise<FailedExecution> {
    const execution = await this.executionStore.get(request.executionId);
    if (!execution) {
      throw new Error("Execution does not exist");
    }

    const parentChildEvent = execution.parent
      ? this.reportCompletionToParentEvent(
          execution.parent,
          request.error,
          request.message
        )
      : undefined;

    await this.executionStore.update(request, parentChildEvent);

    return {
      ...execution,
      error: request.error,
      message: request.message,
      status: ExecutionStatus.FAILED,
      endTime: request.endTime,
    };
  }

  private reportCompletionToParentEvent(
    parent: ExecutionParent,
    ...args: [result: any] | [error: string, message: string]
  ): UpdateEvent {
    return {
      executionId: parent.executionId,
      event: {
        seq: parent.seq,
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
      },
    };
  }
}

export interface StartChildExecutionRequest<W extends Workflow = Workflow>
  extends StartExecutionRequest<W>,
    WorkflowOptions {
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
