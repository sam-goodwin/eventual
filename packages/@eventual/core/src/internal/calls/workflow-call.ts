import { ChildExecution } from "../../execution.js";
import { Workflow, WorkflowExecutionOptions } from "../../workflow.js";
import {
  EventualPromise,
  EventualPromiseSymbol,
  getWorkflowHook,
} from "../eventual-hook.js";
import { SignalTargetType } from "../signal.js";
import {
  createEventualCall,
  EventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";
import { createSendSignalCall } from "./send-signal-call.js";

export function isChildWorkflowCall(a: EventualCall): a is ChildWorkflowCall {
  return isEventualCallOfKind(EventualCallKind.WorkflowCall, a);
}

/**
 * An {@link Eventual} representing an awaited call to a {@link Workflow}.
 */
export interface ChildWorkflowCall
  extends EventualCallBase<EventualCallKind.WorkflowCall> {
  name: string;
  input?: any;
  opts?: WorkflowExecutionOptions;
  /**
   * An Eventual/Promise that determines when a child workflow should timeout.
   *
   * This timeout is separate from the timeout passed to the workflow (opts.timeout), which can only be a relative duration.
   *
   * TODO: support cancellation of child workflow.
   */
  timeout?: Promise<any>;
}

export function createChildWorkflowCall<T>(
  name: string,
  input?: any,
  opts?: WorkflowExecutionOptions,
  timeout?: Promise<any>
): EventualPromise<T> & ChildExecution {
  const hook = getWorkflowHook();
  const eventual = hook.registerEventualCall(
    createEventualCall(EventualCallKind.WorkflowCall, {
      input,
      name,
      opts,
      timeout,
    })
  ) as EventualPromise<T> & ChildExecution;

  // create a reference to the child workflow started at a sequence in this execution.
  // this reference will be resolved by the runtime.
  eventual.sendSignal = function (signal, payload?) {
    const signalId = typeof signal === "string" ? signal : signal.id;
    return createSendSignalCall(
      {
        type: SignalTargetType.ChildExecution,
        seq: eventual[EventualPromiseSymbol]!,
        workflowName: name,
      },
      signalId,
      payload
    ) as unknown as any;
  };

  return eventual;
}
