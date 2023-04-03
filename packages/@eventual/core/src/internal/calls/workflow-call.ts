import { Workflow, WorkflowExecutionOptions } from "../../workflow.js";
import {
  EventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind
} from "./calls.js";

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
