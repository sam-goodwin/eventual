import { ActivityCall, isActivityCall } from "./calls/activity-call.js";
import { AwaitAll, createAwaitAll } from "./await-all.js";
import { chain, Chain } from "./chain.js";
import type { Program } from "./interpret.js";
import { Result } from "./result.js";
import {
  isSleepForCall,
  isSleepUntilCall,
  SleepForCall,
  SleepUntilCall,
} from "./calls/sleep-call.js";
import {
  isWaitForSignalCall,
  WaitForSignalCall,
} from "./calls/wait-for-signal-call.js";
import {
  isRegisterSignalHandlerCall,
  RegisterSignalHandlerCall,
} from "./calls/signal-handler-call.js";
import { isSendSignalCall, SendSignalCall } from "./calls/send-signal-call.js";
import { isWorkflowCall, WorkflowCall } from "./calls/workflow-call.js";
import { ConditionCall, isConditionCall } from "./calls/condition-call.js";

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
  WaitForSignalCall = 6,
  RegisterSignalHandlerCall = 7,
  SendSignalCall = 8,
  ConditionCall = 9,
}

export function isEventual(a: any): a is Eventual {
  return a && typeof a === "object" && EventualSymbol in a;
}

export type Eventual<T = any> =
  | AwaitAll<T extends any[] ? T : never>
  | Chain<T>
  | CommandCall<T>;

/**
 * Calls which emit commands.
 */
export type CommandCall<T = any> =
  | ActivityCall<T>
  | SleepForCall
  | SleepUntilCall
  | WorkflowCall<T>
  | WaitForSignalCall<T>
  | RegisterSignalHandlerCall<T>
  | SendSignalCall
  | ConditionCall;

export function isCommandCall(call: Eventual): call is CommandCall {
  return (
    isActivityCall(call) ||
    isSleepForCall(call) ||
    isSleepUntilCall(call) ||
    isWorkflowCall(call) ||
    isWaitForSignalCall(call) ||
    isRegisterSignalHandlerCall(call) ||
    isSendSignalCall(call) ||
    isConditionCall(call)
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
    return (yield createAwaitAll(activities)) as any;
  }
}

export interface EventualCallCollector {
  pushEventual<E extends Eventual>(activity: E): E;
}

// the below globals are required by the transformer

// @ts-ignore
global.$eventual = chain;
// @ts-ignore
global.$Eventual = Eventual;
