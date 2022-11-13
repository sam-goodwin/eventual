import { isFuture, FutureSymbol, Future, FutureKind } from "./future";
import { Failed, Resolved } from "./result";

export function isAwaitAll(a: any): a is AwaitAll<any> {
  return isFuture(a) && a[FutureSymbol] === FutureKind.AwaitAll;
}

export interface AwaitAll<T extends any[] = any[]> {
  [FutureSymbol]: FutureKind.AwaitAll;
  activities: Future[];
  result?: Resolved<T> | Failed;
}
