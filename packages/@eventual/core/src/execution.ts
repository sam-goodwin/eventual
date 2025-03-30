import {
  CallKind,
  createCall,
  type GetExecutionCall,
  type SendSignalCall,
} from "./internal/calls.js";
import type { EventualHook } from "./internal/eventual-hook.js";
import { isOrchestratorWorker } from "./internal/service-type.js";
import { SignalTargetType } from "./internal/signal.js";
import { EventualServiceClient } from "./service-client.js";
import type { SendSignalProps, Signal } from "./signals.js";

export enum ExecutionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}
const ExecutionStatuses = new Set(Object.values(ExecutionStatus));
export function isExecutionStatus(s: string): s is ExecutionStatus {
  return ExecutionStatuses.has(s as ExecutionStatus);
}

export type ExecutionID<
  WorkflowName extends string = string,
  ID extends string = string
> = `${WorkflowName}/${ID}`;

export interface ExecutionParent {
  /**
   * Seq number when this execution is the child of another workflow.
   */
  seq: number;
  /**
   * Id of the parent workflow, while present.
   */
  executionId: ExecutionID;
}

interface ExecutionBase {
  id: ExecutionID;
  status: ExecutionStatus;
  startTime: string;
  workflowName: string;
  inputHash?: string;
  parent?: ExecutionParent;
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
 *
 * Note: This object should be usable within a workflow. It should only contain deterministic logic
 * {@link EventualCall}s or {@link EventualProperty}s via the {@link EventualHook}.
 */
export class ExecutionHandle<Output> {
  constructor(
    public executionId: ExecutionID,
    private serviceClient?: EventualServiceClient
  ) {}

  /**
   * @return the {@link Execution} with the status, result, error, and other data based on the current status.
   */
  public async getStatus(): Promise<Execution<Output>> {
    const hook = tryGetEventualHook();
    if (hook) {
      return hook.executeEventualCall(
        createCall<GetExecutionCall>(CallKind.GetExecutionCall, {
          executionId: this.executionId,
        })
      );
    } else if (this.serviceClient && !isOrchestratorWorker()) {
      return (await this.serviceClient.getExecution(
        this.executionId
      )) as Execution<Output>;
    } else {
      throw new Error(
        "No EventualHook or EventualServiceClient available to get execution status."
      );
    }
  }

  /**
   * Send a {@link signal} to this execution.
   */
  public async sendSignal<Payload = any>(
    signal: string | Signal<Payload>,
    ...args: SendSignalProps<Payload>
  ): Promise<void> {
    const [payload] = args;
    const hook = tryGetEventualHook();
    if (hook) {
      return hook.executeEventualCall(
        createCall<SendSignalCall>(CallKind.SendSignalCall, {
          signalId: typeof signal === "string" ? signal : signal.id,
          payload,
          target: {
            executionId: this.executionId,
            type: SignalTargetType.Execution,
          },
        })
      );
    } else if (this.serviceClient && !isOrchestratorWorker()) {
      return this.serviceClient.sendSignal({
        execution: this.executionId,
        signal,
        payload,
      });
    } else {
      throw new Error(
        "No EventualHook or EventualServiceClient available to get send signal."
      );
    }
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
