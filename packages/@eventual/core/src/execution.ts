import {
  EventualError,
  InProgressError,
  Signal,
  Workflow,
  WorkflowClient,
  WorkflowOutput,
} from "./index.js";

export enum ExecutionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
}

interface ExecutionBase {
  id: string;
  status: ExecutionStatus;
  startTime: string;
  parent?: {
    /**
     * Seq number when this execution is the child of another workflow.
     */
    seq: number;
    /**
     * Id of the parent workflow, while present.
     */
    executionId: string;
  };
}

export type Execution<Result = any> =
  | InProgressExecution
  | CompleteExecution<Result>
  | FailedExecution;

export interface InProgressExecution extends ExecutionBase {
  status: ExecutionStatus.IN_PROGRESS;
}

export interface CompleteExecution<Result = any> extends ExecutionBase {
  status: ExecutionStatus.COMPLETE;
  endTime: string;
  result?: Result;
}

export interface FailedExecution extends ExecutionBase {
  status: ExecutionStatus.FAILED;
  endTime: string;
  error: string;
  message: string;
}

export function isFailedExecution(
  execution: Execution
): execution is FailedExecution {
  return execution.status === ExecutionStatus.FAILED;
}

export function isCompleteExecution(
  execution: Execution
): execution is CompleteExecution {
  return execution.status === ExecutionStatus.COMPLETE;
}

export class ExecutionHandle<W extends Workflow<any, any>> {
  constructor(
    public executionId: string,
    private workflowClient: WorkflowClient
  ) {}

  /**
   * @return the current status of the execution.
   */
  public async status() {
    return (await this.getExecution()).status;
  }

  /**
   * @return the result of a workflow.
   *
   * If the workflow is in progress {@link InProgressError} will be thrown.
   * If the workflow has failed, {@link EventualError} will be thrown with the error and message.
   */
  public async result(): Promise<WorkflowOutput<Workflow>> {
    const execution = await this.getExecution();
    if (execution.status === ExecutionStatus.IN_PROGRESS) {
      throw new InProgressError("Workflow is still in progress");
    } else if (execution.status === ExecutionStatus.FAILED) {
      throw new EventualError(execution.error, execution.message);
    } else {
      return execution.result;
    }
  }

  /**
   * @return the {@link Execution} with the status, result, error, and other data based on the current status.
   */
  public async getExecution(): Promise<Execution<WorkflowOutput<W>>> {
    return (await this.workflowClient.getExecution(
      this.executionId
    )) as Execution<WorkflowOutput<W>>;
  }

  /**
   * Send a {@link signal} to this execution.
   */
  public async signal<Payload = any>(
    signal: string | Signal<Payload>,
    payload: Payload
  ): Promise<void> {
    return this.workflowClient.sendSignal({
      executionId: this.executionId,
      signal: typeof signal === "string" ? signal : signal.id,
      payload,
    });
  }
}
