import type { Signal } from "@eventual/core";
import type {
  CompletionEvent,
  SignalReceived,
  WorkflowCallHistoryEvent,
} from "@eventual/core/internal";
import { Result } from "../result.js";

export type Trigger<Output> =
  | PromiseTrigger<Output>
  | EventTrigger<Output>
  | AfterEveryEventTrigger<Output>
  | SignalTrigger<Output>;

export const Trigger = {
  onPromiseResolution: <Output = any, Input = any>(
    promise: Promise<Input>,
    handler: PromiseTrigger<Output, Input>["handler"]
  ): PromiseTrigger<Output, Input> => {
    return {
      promise,
      handler,
    };
  },
  afterEveryEvent: <Output = any>(
    handler: AfterEveryEventTrigger<Output>["afterEvery"]
  ): AfterEveryEventTrigger<Output> => {
    return {
      afterEvery: handler,
    };
  },
  onWorkflowEvent: <Output, T extends CompletionEvent["type"]>(
    eventType: T,
    handler: TriggerHandler<[event: CompletionEvent & { type: T }], Output>
  ): EventTrigger<Output, CompletionEvent & { type: T }> => {
    return {
      eventType,
      handler,
    };
  },
  onSignal: <Output = any, Payload = any>(
    signalId: Signal<Payload>["id"],
    handler: SignalTrigger<Output, Payload>["handler"]
  ): SignalTrigger<Output, Payload> => {
    return {
      signalId,
      handler,
    };
  },
};

export type TriggerHandler<Args extends any[], Output> =
  | {
      (...args: Args): void | undefined | Result<Output>;
    }
  | Result<Output>;

export interface PromiseTrigger<Output, Input = any> {
  promise: Promise<Input>;
  handler: TriggerHandler<[val: Result<Input>], Output>;
}

export interface AfterEveryEventTrigger<Output> {
  afterEvery: TriggerHandler<[], Output>;
}

export interface EventTrigger<
  out Output = any,
  E extends CompletionEvent = any
> {
  eventType: E["type"];
  handler: TriggerHandler<[event: E], Output>;
}

export interface SignalTrigger<Output, Payload = any> {
  signalId: Signal["id"];
  handler: TriggerHandler<[event: SignalReceived<Payload>], Output>;
}

export function isPromiseTrigger<Output, R>(
  t: Trigger<Output>
): t is PromiseTrigger<Output, R> {
  return "promise" in t;
}

export function isAfterEveryEventTrigger<Output>(
  t: Trigger<Output>
): t is AfterEveryEventTrigger<Output> {
  return "afterEvery" in t;
}

export function isEventTrigger<Output, E extends CompletionEvent>(
  t: Trigger<Output>
): t is EventTrigger<Output, E> {
  return "eventType" in t;
}

export function isSignalTrigger<Output, Payload = any>(
  t: Trigger<Output>
): t is SignalTrigger<Output, Payload> {
  return "signalId" in t;
}

interface EventualDefinitionBase {
  /**
   * Return the event form of a call.
   *
   * If undefined, the call will not be emitted by the workflow.
   * If there was a expected event and these events do not match, the workflow will throw a {@link DeterminismError}
   */
  createCallEvent?: (seq: number) => WorkflowCallHistoryEvent;
}

export interface ResolvedEventualDefinition<R> extends EventualDefinitionBase {
  /**
   * When provided, immediately resolves an EventualPromise with a value or error back to the workflow.
   *
   * Commands can still be emitted, but the eventual cannot be triggered.
   */
  result: Result<R>;
}

export interface UnresolvedEventualDefinition<R>
  extends EventualDefinitionBase {
  /**
   * Triggers give the Eventual an opportunity to resolve themselves.
   *
   * Triggers are only called when an eventual is considered to be active.
   */
  triggers: Trigger<R> | (Trigger<R> | undefined)[];
}

export type EventualDefinition<R> =
  | ResolvedEventualDefinition<R>
  | UnresolvedEventualDefinition<R>;

export function isResolvedEventualDefinition<R>(
  eventualDefinition: EventualDefinition<R>
): eventualDefinition is ResolvedEventualDefinition<R> {
  return "result" in eventualDefinition;
}
