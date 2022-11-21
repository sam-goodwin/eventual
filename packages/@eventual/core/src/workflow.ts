import {
  AwaitedEventual,
  Eventual,
  EventualKind,
  EventualSymbol,
} from "./eventual.js";
import { registerActivity } from "./global.js";
import type { Program } from "./interpret.js";
import type { Result } from "./result.js";

export interface ExecutionHandle {
  /**
   * ID of the workflow execution.
   */
  executionId: string;
}

/**
 * A {@link Workflow} is a long-running process that orchestrates calls
 * to other services in a durable and observable way.
 */
export interface Workflow<F extends (...args: any[]) => any> {
  id: string;
  /**
   * Invokes
   */
  (...args: Parameters<F>): ReturnType<F>;
  /**
   * Starts an execution of this {@link Workflow} without waiting for the response.
   *
   * @returns a {@link ExecutionHandle} with the `executionId`.
   */
  startExecution(...args: Parameters<F>): Promise<ExecutionHandle>;

  /**
   * @internal - this is the internal DSL representation that produces a {@link Program} instead of a Promise.
   */
  definition: (
    ...args: Parameters<F>
  ) => Program<AwaitedEventual<ReturnType<F>>>;
}

export function workflow<F extends (...args: any[]) => Promise<any> | Program>(
  id: string,
  definition: F
): Workflow<F> {
  const workflow: Workflow<F> = ((...args: any[]) =>
    registerActivity({
      [EventualSymbol]: EventualKind.WorkflowCall,
      id,
      args,
    })) as any;

  // TODO:
  // workflow.start = function start(...args) {};

  workflow.definition = definition as Workflow<F>["definition"]; // safe to cast because we rely on transformer (it is always the generator API)
  return workflow;
}

export function isWorkflowCall<T>(a: Eventual<T>): a is WorkflowCall<T> {
  return a[EventualSymbol] === EventualKind.WorkflowCall;
}

export interface WorkflowCall<T = any> {
  [EventualSymbol]: EventualKind.WorkflowCall;
  id: string;
  args: any[];
  result?: Result<T>;
}
