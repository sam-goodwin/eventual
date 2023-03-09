import type {
  Activity,
  ActivityExecutionContext,
  ActivityInvocationContext,
  AsyncResult,
} from "../activity.js";

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
