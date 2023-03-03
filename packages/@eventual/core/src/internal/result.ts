import { extendsError, or } from "./util.js";

export const ResultSymbol = Symbol.for("eventual:Result");

export type Result<T = any> = Resolved<T> | Failed;

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
};

export enum ResultKind {
  Pending = 0,
  Resolved = 1,
  Failed = 2,
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
  return normalizeError(result.error);
}

export function normalizeError(err: any) {
  const [error, message] = extendsError(err)
    ? [err.name, err.message]
    : ["Error", JSON.stringify(err)];
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
