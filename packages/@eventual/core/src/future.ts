import type { AwaitAll } from "./await-all";
import { ActivityCall } from "./activity-call";
import { Chain } from "./chain";
import { Program } from "./interpret";

export const FutureSymbol = Symbol.for("eventual:Future");

export enum FutureKind {
  AwaitAll = 0,
  ActivityCall = 1,
  Chain = 2,
}

export function isFuture(a: any): a is Future {
  return a && typeof a === "object" && FutureSymbol in a;
}

// rename: Future/Eventual/Awaitable
export type Future<T = any> =
  | ActivityCall<T>
  | AwaitAll<T extends any[] ? T : never>
  | Chain<T>;

export namespace Future {
  /**
   * Wait for all {@link activities} to complete or until at least one throws.
   *
   * This is the equivalent behavior to Promise.all.
   */
  export function* all<A extends Future[]>(
    activities: A
  ): Program<
    AwaitAll<{
      [i in keyof A]: A[i] extends Future<infer T> ? T : A[i];
    }>
  > {
    return (yield <
      AwaitAll<{
        [i in keyof A]: A[i] extends Future<infer T> ? T : A[i];
      }>
    >{
      [FutureSymbol]: FutureKind.AwaitAll,
      activities,
    }) as any;
  }
}
