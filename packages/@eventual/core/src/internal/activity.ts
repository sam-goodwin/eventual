import type { Activity, AsyncResult } from "../activity.js";

export const AsyncTokenSymbol = Symbol.for("eventual:AsyncToken");

export type ActivityArguments<A extends Activity<any, any>> =
  A extends Activity<string, infer Arguments extends any[]> ? Arguments : never;

export function isAsyncResult(obj: any): obj is AsyncResult {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}
