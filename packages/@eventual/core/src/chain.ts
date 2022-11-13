import { isFuture, FutureSymbol, FutureKind, Future } from "./future";
import { registerActivity } from "./global";
import { Program } from "./interpret";
import { Result } from "./result";

export function isChain(a: any): a is Chain {
  return isFuture(a) && a[FutureSymbol] === FutureKind.Thread;
}

export interface Chain<T = any> extends Program<T> {
  [FutureSymbol]: FutureKind.Thread;
  result?: Result<T>;
  awaiting?: Future;
}

export function createChain(program: Program): Chain {
  (program as any)[FutureSymbol] = FutureKind.Thread;
  return program as Chain;
}

export function registerChain(program: Program): Chain {
  return registerActivity(createChain(program));
}
