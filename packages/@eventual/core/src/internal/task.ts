import type { ServiceContext } from "../service.js";
import type {
  AsyncResult,
  Task,
  TaskExecutionContext,
  TaskInvocationContext,
  TaskOptions,
} from "../task.js";
import type { SourceLocation } from "./service-spec.js";

/**
 * Globals that may be overridden by the core-runtime. See matching core-runtime file to understand
 * the specific behavior.
 *
 * In this case, we'll provide a default no-op hook function.
 * When someone uses the enterEventualCallHookScope in runtime, the getEventualCallHook function
 * will be overridden to return that hook (based on async scope.)
 */
declare global {
  export function getEventualTaskRuntimeContext(): TaskRuntimeContext;
}

export interface TaskRuntimeContext {
  execution: TaskExecutionContext;
  invocation: TaskInvocationContext;
  service: ServiceContext;
}

// default implementation of getEventualTaskRuntimeContext that throws.
// to be overridden by the core-runtime.
// only set if it was not set before.
globalThis.getEventualTaskRuntimeContext ??= () => {
  throw new Error("Eventual task context has not been registered yet.");
};

export const AsyncTokenSymbol = /* @__PURE__ */ Symbol.for(
  "eventual:AsyncToken"
);

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
