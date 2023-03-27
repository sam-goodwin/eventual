import type {
  Activity,
  ActivityExecutionContext,
  ActivityInvocationContext,
  ActivityOptions,
  AsyncResult,
} from "../activity.js";
import { SourceLocation } from "./service-spec.js";

export const AsyncTokenSymbol = /* @__PURE__ */ Symbol.for(
  "eventual:AsyncToken"
);

export interface ActivityRuntimeContext {
  execution: ActivityExecutionContext;
  invocation: ActivityInvocationContext;
}

export type ActivityInput<A extends Activity<any, any>> = A extends Activity<
  string,
  infer Input
>
  ? Input
  : never;

export function isAsyncResult(obj: any): obj is AsyncResult {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}

export interface ActivitySpec<Name extends string = string> {
  /**
   * Unique name of this Activity.
   */
  name: Name;
  /**
   * Optional runtime properties.
   */
  options?: ActivityOptions;
  sourceLocation?: SourceLocation;
}
