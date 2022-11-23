import { ActivityCall, isActivityCall } from "./activity-call.js";
import type { AwaitAll } from "./await-all.js";
import { chain, Chain } from "./chain.js";
import type { Program } from "./interpret.js";
import { Result } from "./result.js";
import {
  isSleepForCall,
  isSleepUntilCall,
  SleepForCall,
  SleepUntilCall,
} from "./sleep-call.js";
import { isWorkflowCall, WorkflowCall } from "./workflow.js";

export type AwaitedEventual<T> = T extends Promise<infer U>
  ? Awaited<U>
  : T extends Program<infer U>
  ? AwaitedEventual<U>
  : T extends Eventual<infer U>
  ? AwaitedEventual<U>
  : T;

export const EventualSymbol = Symbol.for("eventual:Eventual");

export interface EventualBase<R extends Result> {
  [EventualSymbol]: EventualKind;
  result?: R;
}

export enum EventualKind {
  AwaitAll = 0,
  ActivityCall = 1,
  Chain = 2,
  SleepForCall = 3,
  SleepUntilCall = 4,
  WorkflowCall = 5,
}

export function isEventual(a: any): a is Eventual {
  return a && typeof a === "object" && EventualSymbol in a;
}

export type Eventual<T = any> =
  | ActivityCall<T>
  | AwaitAll<T extends any[] ? T : never>
  | Chain<T>
  | WorkflowCall<T>
  | SleepForCall
  | SleepUntilCall;

/**
 * Calls which emit commands.
 */
export type CommandCall =
  | ActivityCall
  | SleepForCall
  | SleepUntilCall
  | WorkflowCall;

export function isCommandCall(call: Eventual): call is CommandCall {
  return (
    isActivityCall(call) ||
    isSleepForCall(call) ||
    isSleepUntilCall(call) ||
    isWorkflowCall(call)
  );
}

export namespace Eventual {
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

// the below globals are required by the transformer

// @ts-ignore
global.$eventual = chain;
// @ts-ignore
global.$Eventual = Eventual;
