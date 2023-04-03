import type {
  AsyncResult,
  Task,
  TaskExecutionContext,
  TaskInvocationContext,
  TaskOptions,
} from "../task.js";
import type { SourceLocation } from "./service-spec.js";

export const AsyncTokenSymbol = /* @__PURE__ */ Symbol.for(
  "eventual:AsyncToken"
);

export interface TaskRuntimeContext {
  execution: TaskExecutionContext;
  invocation: TaskInvocationContext;
}

export type TaskInput<A extends Task<any, any>> = A extends Task<
  string,
  infer Input
>
  ? Input
  : never;

export function isAsyncResult(obj: any): obj is AsyncResult {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}

export interface TaskSpec<Name extends string = string> {
  /**
   * Unique name of this Task.
   */
  name: Name;
  /**
   * Optional runtime properties.
   */
  options?: TaskOptions;
  sourceLocation?: SourceLocation;
}
