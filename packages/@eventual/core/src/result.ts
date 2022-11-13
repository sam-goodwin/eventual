import { Activity } from "./activity";

export const ResultSymbol = Symbol.for("eventual:Result");

export type Result<T = any> = Pending | Resolved<T> | Failed;

export namespace Result {
  export function resolved<T>(value: T): Resolved<T> {
    return {
      [ResultSymbol]: ResultKind.Resolved,
      value,
    };
  }

  export function failed(error: any): Failed {
    return {
      [ResultSymbol]: ResultKind.Failed,
      error,
    };
  }

  export function pending<A extends Activity>(activity: A): Pending<A> {
    return {
      [ResultSymbol]: ResultKind.Pending,
      activity,
    };
  }
}

export enum ResultKind {
  Pending = 0,
  Resolved = 1,
  Failed = 2,
}

export interface Pending<A extends Activity = Activity> {
  [ResultSymbol]: ResultKind.Pending;
  activity: A;
}

export interface Resolved<T = any> {
  [ResultSymbol]: ResultKind.Resolved;
  value: T;
}

export interface Failed {
  [ResultSymbol]: ResultKind.Failed;
  error: any;
}

export function isResult(a: any): a is Result {
  return a && typeof a === "object" && ResultSymbol in a;
}

export function isPending(result: Result | undefined): result is Pending {
  return isResult(result) && result[ResultSymbol] === ResultKind.Pending;
}

export function isResolved<T>(
  result: Result<T> | undefined
): result is Resolved<T> {
  return isResult(result) && result[ResultSymbol] === ResultKind.Resolved;
}

export function isFailed(result: Result | undefined): result is Failed {
  return isResult(result) && result[ResultSymbol] === ResultKind.Failed;
}
