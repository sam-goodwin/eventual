import { Eventual } from "./eventual.js";
import { extendsError, or } from "./util.js";

export const ResultSymbol = Symbol.for("eventual:Result");

export type Result<T = any> = Pending | Resolved<T> | Failed;

export const Result = {
  resolved<T>(value: T): Resolved<T> {
    return {
      [ResultSymbol]: ResultKind.Resolved,
      value,
    };
  },
  failed(error: any): Failed {
    return {
      [ResultSymbol]: ResultKind.Failed,
      error,
    };
  },
  pending<A extends Eventual>(activity: A): Pending<A> {
    return {
      [ResultSymbol]: ResultKind.Pending,
      activity,
    };
  },
};

export enum ResultKind {
  Pending = 0,
  Resolved = 1,
  Failed = 2,
}

export interface Pending<A extends Eventual = Eventual> {
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

export function normalizeFailedResult(result: Failed): {
  error: string;
  message: string;
} {
  const [error, message] = extendsError(result.error)
    ? [result.error.name, result.error.message]
    : ["Error", JSON.stringify(result.error)];
  return { error, message };
}

export function resultToString(result?: Result) {
  if (isFailed(result)) {
    const { error, message } = normalizeFailedResult(result);
    return `${error}: ${message}`;
  } else if (isResolved(result)) {
    return result.value ? JSON.stringify(result.value) : "";
  } else {
    return "";
  }
}

export const isResolvedOrFailed = or(isResolved, isFailed);
