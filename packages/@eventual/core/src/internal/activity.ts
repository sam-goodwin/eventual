import type { Activity, AsyncResult } from "../activity.js";

export const AsyncTokenSymbol = Symbol.for("eventual:AsyncToken");

export type ActivityInput<A extends Activity<any, any>> = A extends Activity<
  string,
  infer Input
>
  ? Input
  : never;

export function isAsyncResult(obj: any): obj is AsyncResult {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}
