import { Program } from "./interpret";
import { registerChain, Chain } from "./chain";
import { ActivityCall } from "./activity-call";
import { AwaitAll } from "./await-all";

export function eventual<F extends (...args: any[]) => Promise<any>>(
  func: F
): (...args: Parameters<F>) => Program<Awaited<ReturnType<F>>>;

export function eventual<F extends (...args: any[]) => Program>(
  func: F
): (...args: Parameters<F>) => Chain<Resolved<ReturnType<F>>>;

export function eventual<F extends (...args: any[]) => any>(func: F): F {
  return ((...args: any[]) => {
    const generator = func(...args);
    return registerChain(generator);
  }) as any;
}

type Resolved<T> = T extends Program<infer U>
  ? Resolved<U>
  : T extends Eventual<infer U>
  ? Resolved<U>
  : T;

export const EventualSymbol = Symbol.for("eventual:Eventual");

export enum EventualKind {
  AwaitAll = 0,
  ActivityCall = 1,
  Chain = 2,
}

export function isEventual(a: any): a is Eventual {
  return a && typeof a === "object" && EventualSymbol in a;
}

// rename: Future/Eventual/Awaitable
export type Eventual<T = any> =
  | ActivityCall<T>
  | AwaitAll<T extends any[] ? T : never>
  | Chain<T>;

export namespace Future {
  /**
   * Wait for all {@link activities} to complete or until at least one throws.
   *
   * This is the equivalent behavior to Promise.all.
   */
  export function* all<A extends Eventual[]>(
    activities: A
  ): Program<
    AwaitAll<{
      [i in keyof A]: A[i] extends Eventual<infer T> ? T : A[i];
    }>
  > {
    return (yield <
      AwaitAll<{
        [i in keyof A]: A[i] extends Eventual<infer T> ? T : A[i];
      }>
    >{
      [EventualSymbol]: EventualKind.AwaitAll,
      activities,
    }) as any;
  }
}
