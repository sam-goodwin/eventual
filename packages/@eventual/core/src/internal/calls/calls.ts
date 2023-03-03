import { ActivityCall } from "./activity-call.js";
import { AwaitDurationCall, AwaitTimeCall } from "./await-time-call.js";
import { ConditionCall } from "./condition-call.js";
import { ExpectSignalCall } from "./expect-signal-call.js";
import { PublishEventsCall } from "./publish-events-call.js";
import { SendSignalCall } from "./send-signal-call.js";
import { RegisterSignalHandlerCall } from "./signal-handler-call.js";
import { WorkflowCall } from "./workflow-call.js";

export type EventualCall =
  | ActivityCall
  | AwaitDurationCall
  | AwaitTimeCall
  | ConditionCall
  | ExpectSignalCall
  | PublishEventsCall
  | SendSignalCall
  | RegisterSignalHandlerCall
  | WorkflowCall;

export enum EventualCallKind {
  ActivityCall = 1,
  AwaitAll = 0,
  AwaitAllSettled = 12,
  AwaitAny = 10,
  AwaitDurationCall = 3,
  AwaitTimeCall = 4,
  ConditionCall = 9,
  ExpectSignalCall = 6,
  PublishEventsCall = 13,
  Race = 11,
  RegisterSignalHandlerCall = 7,
  SendSignalCall = 8,
  WorkflowCall = 5,
}

const EventualCallSymbol = Symbol.for("eventual:EventualCall");

export interface EventualCallBase<
  Kind extends EventualCall[typeof EventualCallSymbol]
> {
  [EventualCallSymbol]: Kind;
}

export function createEventualCall<E extends EventualCall>(
  kind: E[typeof EventualCallSymbol],
  e: Omit<E, typeof EventualCallSymbol>
): E {
  (e as E)[EventualCallSymbol] = kind;
  return e as E;
}

export function isEventualCall(a: any): a is EventualCall {
  return a && typeof a === "object" && EventualCallSymbol in a;
}

export function isEventualCallOfKind<E extends EventualCall>(
  kind: E[typeof EventualCallSymbol],
  a: any
): a is E {
  return isEventualCall(a) && a[EventualCallSymbol] === kind;
}
