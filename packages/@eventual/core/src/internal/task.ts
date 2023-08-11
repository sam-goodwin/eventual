import type { Task, TaskOptions } from "../task.js";
import type { SourceLocation } from "./service-spec.js";

export const AsyncTokenSymbol = /* @__PURE__ */ Symbol.for(
  "eventual:AsyncToken"
);

export type TaskInput<A extends Task<any, any>> = A extends Task<
  string,
  infer Input
>
  ? Input
  : never;

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
