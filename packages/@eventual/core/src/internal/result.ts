export const ResultSymbol = /* @__PURE__ */ Symbol.for("eventual:Result");

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
  Resolved = 0,
  Failed = 1,
}

export interface Resolved<T = any> {
  [ResultSymbol]: ResultKind.Resolved;
  value: T;
}

export interface Failed {
  [ResultSymbol]: ResultKind.Failed;
  error: any;
}
