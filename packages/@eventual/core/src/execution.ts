import { ulid } from "ulidx";
import { ExecutionID } from "./index.js";
import { EventualServiceClient } from "./service-client.js";
import { Signal, SendSignalProps } from "./signals.js";
import { Workflow, WorkflowOutput } from "./workflow.js";

export enum ExecutionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}
const ExecutionStatuses = new Set(Object.values(ExecutionStatus));
export function isExecutionStatus(s: string): s is ExecutionStatus {
  return ExecutionStatuses.has(s as ExecutionStatus);
}

interface ExecutionBase {
  id: ExecutionID;
  status: ExecutionStatus;
  startTime: string;
  workflowName: string;
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
  | SucceededExecution<Result>
  | FailedExecution;

export interface InProgressExecution extends ExecutionBase {
  status: ExecutionStatus.IN_PROGRESS;
}

export interface SucceededExecution<Result = any> extends ExecutionBase {
  status: ExecutionStatus.SUCCEEDED;
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

export function isSucceededExecution(
  execution: Execution
): execution is SucceededExecution {
  return execution.status === ExecutionStatus.SUCCEEDED;
}

/**
 * A reference to a running execution.
 */
export class ExecutionHandle<W extends Workflow> implements ChildExecution {
  constructor(
    public executionId: ExecutionID,
    private serviceClient: EventualServiceClient
  ) {}

  /**
   * @return the {@link Execution} with the status, result, error, and other data based on the current status.
   */
  public async getStatus(): Promise<Execution<WorkflowOutput<W>>> {
    return (await this.serviceClient.getExecution(
      this.executionId
    )) as Execution<WorkflowOutput<W>>;
  }

  /**
   * Send a {@link signal} to this execution.
   */
  public async sendSignal<Payload = any>(
    signal: string | Signal<Payload>,
    ...args: SendSignalProps<Payload>
  ): Promise<void> {
    const [payload] = args;
    return this.serviceClient.sendSignal({
      execution: this.executionId,
      signal: typeof signal === "string" ? signal : signal.id,
      payload,
      id: ulid(),
    });
  }
}

/**
 * A reference to an execution started by another workflow.
 */
export interface ChildExecution {
  /**
   * Allows a {@link workflow} to send a signal to the workflow {@link Execution}.
   *
   * ```ts
   * const mySignal = signal<string>("MySignal");
   * const childWf = workflow(...);
   * workflow("wf", async () => {
   *    const child = childWf();
   *    child.sendSignal(mySignal);
   *    await child;
   * })
   * ```
   *
   * @param id an optional, execution unique ID, will be used to de-dupe the signal at the target execution.
   */
  sendSignal<Payload = any>(
    signal: string | Signal<Payload>,
    ...args: SendSignalProps<Payload>
  ): Promise<void>;
}
