import type { ActivityCall } from "./activity-call.js";
import type { AwaitTimerCall } from "./await-time-call.js";
import type { ConditionCall } from "./condition-call.js";
import type { DictionaryCall } from "./dictionary-call.js";
import type { ExpectSignalCall } from "./expect-signal-call.js";
import type { PublishEventsCall } from "./publish-events-call.js";
import type { SendSignalCall } from "./send-signal-call.js";
import type { RegisterSignalHandlerCall } from "./signal-handler-call.js";
import type { ChildWorkflowCall } from "./workflow-call.js";

export type EventualCall =
  | ActivityCall
  | AwaitTimerCall
  | ConditionCall
  | DictionaryCall
  | ChildWorkflowCall
  | ExpectSignalCall
  | PublishEventsCall
  | RegisterSignalHandlerCall
  | SendSignalCall;

export enum EventualCallKind {
  ActivityCall = 0,
  AwaitTimerCall = 1,
  ConditionCall = 2,
  DictionaryCall = 8,
  ExpectSignalCall = 3,
  PublishEventsCall = 4,
  RegisterSignalHandlerCall = 5,
  SendSignalCall = 6,
  WorkflowCall = 7,
}

const EventualCallSymbol = /* @__PURE__ */ Symbol.for("eventual:EventualCall");

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
