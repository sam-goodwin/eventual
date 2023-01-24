import { AwaitAllSettled, createAwaitAllSettled } from "./await-all-settled.js";
import { AwaitAll, createAwaitAll } from "./await-all.js";
import { AwaitAny, createAwaitAny } from "./await-any.js";
import { ActivityCall, isActivityCall } from "./calls/activity-call.js";
import {
  AwaitDurationCall,
  AwaitTimeCall,
  isAwaitDurationCall,
  isAwaitTimeCall,
} from "./calls/await-time-call.js";
import { ConditionCall } from "./calls/condition-call.js";
import { ExpectSignalCall } from "./calls/expect-signal-call.js";
import {
  isPublishEventsCall,
  PublishEventsCall,
} from "./calls/send-events-call.js";
import { isSendSignalCall, SendSignalCall } from "./calls/send-signal-call.js";
import { RegisterSignalHandlerCall } from "./calls/signal-handler-call.js";
import { isWorkflowCall, WorkflowCall } from "./calls/workflow-call.js";
import { chain, Chain } from "./chain.js";
import { isOrchestratorWorker } from "./flags.js";
import type { Program } from "./interpret.js";
import { createRace, Race } from "./race.js";
import { Result } from "./result.js";

export type AwaitedEventual<T> = T extends Promise<infer U>
  ? Awaited<U>
  : T extends Program<infer U>
  ? AwaitedEventual<U>
  : T extends Eventual<infer U>
  ? AwaitedEventual<U>
  : T;

const EventualSymbol = Symbol.for("eventual:Eventual");

export interface EventualBase<Kind extends EventualKind, R extends Result> {
  [EventualSymbol]: Kind;
  result?: R;
}

export enum EventualKind {
  ActivityCall = 1,
  AwaitAll = 0,
  AwaitAllSettled = 12,
  AwaitAny = 10,
  AwaitDurationCall = 3,
  AwaitTimeCall = 4,
  Chain = 2,
  ConditionCall = 9,
  ExpectSignalCall = 6,
  PublishEventsCall = 13,
  Race = 11,
  RegisterSignalHandlerCall = 7,
  SendSignalCall = 8,
  WorkflowCall = 5,
}

export function isEventual(a: any): a is Eventual {
  return a && typeof a === "object" && EventualSymbol in a;
}

export function isEventualOfKind<E extends Eventual>(
  kind: E[typeof EventualSymbol],
  a: any
): a is E {
  return isEventual(a) && a[EventualSymbol] === kind;
}

export function createEventual<E extends Eventual>(
  kind: E[typeof EventualSymbol],
  e: Omit<E, typeof EventualSymbol>
): E {
  (e as E)[EventualSymbol] = kind;
  return e as E;
}

export type Eventual<T = any> =
  | AwaitAll<T extends any[] ? T : never>
  | AwaitAllSettled<T extends any[] ? T : never>
  | AwaitAny<T extends any[] ? T : never>
  | Chain<T>
  | CommandCall<T>
  | ConditionCall
  | ExpectSignalCall
  | Race<T extends any[] ? T : never>
  | RegisterSignalHandlerCall<T>;

/**
 * Calls which emit commands.
 */
export type CommandCall<T = any> =
  | ActivityCall<T>
  | AwaitDurationCall
  | AwaitTimeCall
  | PublishEventsCall
  | SendSignalCall
  | WorkflowCall<T>;

export function isCommandCall(call: Eventual): call is CommandCall {
  return (
    isActivityCall(call) ||
    isPublishEventsCall(call) ||
    isSendSignalCall(call) ||
    isAwaitDurationCall(call) ||
    isAwaitTimeCall(call) ||
    isWorkflowCall(call)
  );
}

export const Eventual = {
  /**
   * Wait for all {@link activities} to succeed or until at least one throws.
   *
   * This is the equivalent behavior to Promise.all.
   */
  all<A extends Eventual[]>(
    activities: A
  ): AwaitAll<EventualArrayPositional<A>> {
    if (!isOrchestratorWorker()) {
      throw new Error("Eventual.all is only valid in a workflow");
    }

    return createAwaitAll(activities) as any;
  },
  any<A extends Eventual[]>(activities: A): AwaitAny<EventualArrayUnion<A>> {
    if (!isOrchestratorWorker()) {
      throw new Error("Eventual.any is only valid in a workflow");
    }

    return createAwaitAny(activities) as any;
  },
  race<A extends Eventual[]>(activities: A): Race<EventualArrayUnion<A>> {
    if (!isOrchestratorWorker()) {
      throw new Error("Eventual.race is only valid in a workflow");
    }

    return createRace(activities) as any;
  },
  allSettled<A extends Eventual[]>(
    activities: A
  ): AwaitAllSettled<EventualArrayPromiseResult<A>> {
    if (!isOrchestratorWorker()) {
      throw new Error("Eventual.allSettled is only valid in a workflow");
    }

    return createAwaitAllSettled(activities) as any;
  },
};

export interface EventualCallCollector {
  pushEventual<E extends Eventual>(activity: E): E;
}

export type EventualArrayPositional<A extends Eventual[]> = {
  [i in keyof A]: A[i] extends Eventual<infer T> ? T : A[i];
};

export type EventualArrayPromiseResult<A extends Eventual[]> = {
  [i in keyof A]:
    | PromiseFulfilledResult<A[i] extends Eventual<infer T> ? T : A[i]>
    | PromiseRejectedResult;
};

export type EventualArrayUnion<A extends Eventual<any>[]> =
  A[number] extends Eventual<infer T> ? T : never;

// the below globals are required by the transformer

declare global {
  // eslint-disable-next-line no-var
  var $eventual: typeof chain;
  // eslint-disable-next-line no-var
  var $Eventual: typeof Eventual;
}

global.$eventual = chain;
global.$Eventual = Eventual;
