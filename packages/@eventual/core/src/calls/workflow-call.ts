import {
  createEventual,
  Eventual,
  EventualBase,
  EventualKind,
  isEventualOfKind,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Result } from "../result.js";
import {
  SendSignalProps,
  Signal,
  SignalPayload,
  SignalTargetType,
} from "../signals.js";
import { Workflow, WorkflowOptions } from "../workflow.js";
import { createSendSignalCall } from "./send-signal-call.js";

export function isWorkflowCall<T>(a: Eventual<T>): a is WorkflowCall<T> {
  return isEventualOfKind(EventualKind.WorkflowCall, a);
}

/**
 * An {@link Eventual} representing an awaited call to a {@link Workflow}.
 */
export interface WorkflowCall<T = any>
  extends EventualBase<EventualKind.WorkflowCall, Result<T>>,
    ChildExecution {
  name: string;
  input?: any;
  seq?: number;
  opts?: WorkflowOptions;
}

export function createWorkflowCall(
  name: string,
  input?: any,
  opts?: WorkflowOptions
): WorkflowCall {
  const call = registerEventual(
    createEventual<WorkflowCall>(EventualKind.WorkflowCall, {
      input,
      name,
      opts,
    } as WorkflowCall)
  );

  // create a reference to the child workflow started at a sequence in this execution.
  // this reference will be resolved by the runtime.
  call.signal = function (signal, payload?, id?) {
    return createSendSignalCall(
      {
        type: SignalTargetType.ChildExecution,
        seq: call.seq!,
        workflowName: call.name,
      },
      signal.id,
      payload,
      id
    ) as unknown as any;
  };

  return call;
}

export interface ChildExecution {
  /**
   * Allows a {@link workflow} to send a signal to any workflow {@link Execution} by executionId.
   *
   * ```ts
   * const mySignal = signal<string>("MySignal");
   * const childWf = workflow(...);
   * workflow("wf", async () => {
   *    const child = childWf();
   *    child.signal(mySignal);
   *    await child;
   * })
   * ```
   *
   * @param id an optional, execution unique ID, will be used to de-dupe the signal at the target execution.
   */
  signal<S extends Signal<any>>(
    signal: S,
    ...args: SendSignalProps<SignalPayload<S>>
  ): Promise<void>;
}
