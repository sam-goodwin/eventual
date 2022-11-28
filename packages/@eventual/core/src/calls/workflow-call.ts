import {
  Eventual,
  EventualKind,
  EventualSymbol,
  isEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Result } from "../result.js";
import { Workflow } from "../workflow.js";

export function isWorkflowCall<T>(a: Eventual<T>): a is WorkflowCall<T> {
  return isEventual(a) && a[EventualSymbol] === EventualKind.WorkflowCall;
}

/**
 * An {@link Eventual} representing an awaited call to a {@link Workflow}.
 */
export interface WorkflowCall<T = any> {
  [EventualSymbol]: EventualKind.WorkflowCall;
  name: string;
  input: any;
  result?: Result<T>;
  seq?: number;
}

export function createWorkflowCall(name: string, input?: any): WorkflowCall {
  return registerEventual<WorkflowCall>({
    [EventualSymbol]: EventualKind.WorkflowCall,
    input,
    name,
  });
}
