export type Result<T = any> = Pending | Resolved<T> | Failed;

export interface Pending {
  pending: true;
}

export function isPending(result: Result): result is Pending {
  return "pending" in result;
}

export interface Resolved<T> {
  value: T;
}

export function isResolved<T>(a: Result<T>): a is Resolved<T> {
  return "value" in a;
}

export interface Failed {
  error: any;
}

export function isFailed(a: Result): a is Failed {
  return "error" in a;
}
