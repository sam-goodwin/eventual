import type { Bucket } from "../bucket.js";
import type { ConditionPredicate } from "../condition.js";
import type {
  Entity,
  EntityIndex,
  EntityTransactItem,
} from "../entity/entity.js";
import type { EventEnvelope } from "../event.js";
import type { DurationSchedule, Schedule } from "../schedule.js";
import type { SearchIndex } from "../search/search-index.js";
import { Task } from "../task.js";
import type { WorkflowExecutionOptions } from "../workflow.js";
import type { BucketMethod } from "./bucket-hook.js";
import { SendTaskHeartbeatResponse } from "./eventual-service.js";
import type { SignalTarget } from "./signal.js";

export type EventualCall =
  | AwaitTimerCall
  | BucketCall
  | ChildWorkflowCall
  | ConditionCall
  | EmitEventsCall
  | EntityCall
  | ExpectSignalCall
  | InvokeTransactionCall
  | RegisterSignalHandlerCall
  | SearchCall
  | SendSignalCall
  | TaskCall
  | TaskRequestCall;

export enum EventualCallKind {
  AwaitTimerCall = 1,
  BucketCall = 10,
  ConditionCall = 2,
  EntityCall = 8,
  ExpectSignalCall = 3,
  InvokeTransactionCall = 9,
  EmitEventsCall = 4,
  RegisterSignalHandlerCall = 5,
  SendSignalCall = 6,
  TaskCall = 0,
  TaskRequestCall = 12,
  WorkflowCall = 7,
  SearchCall = 11,
}

export const EventualCallSymbol = /* @__PURE__ */ Symbol.for(
  "eventual:EventualCall"
);

export type EventualCallOutput<E extends EventualCall> =
  E extends EventualCallBase<any, infer Output> ? Output : never;

export interface EventualCallBase<
  Kind extends EventualCall[typeof EventualCallSymbol],
  Output
> {
  __output: Output;
  [EventualCallSymbol]: Kind;
}

export function createEventualCall<E extends EventualCall>(
  kind: E[typeof EventualCallSymbol],
  e: Omit<E, typeof EventualCallSymbol | "__output">
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

export function isAwaitTimerCall(a: any): a is AwaitTimerCall {
  return isEventualCallOfKind(EventualCallKind.AwaitTimerCall, a);
}

export interface AwaitTimerCall
  extends EventualCallBase<EventualCallKind.AwaitTimerCall, void> {
  schedule: Schedule;
}

export function isConditionCall(a: any): a is ConditionCall {
  return isEventualCallOfKind(EventualCallKind.ConditionCall, a);
}

export interface ConditionCall
  extends EventualCallBase<EventualCallKind.ConditionCall, boolean> {
  predicate: ConditionPredicate;
  timeout?: Promise<any>;
}

export function isEmitEventsCall(a: any): a is EmitEventsCall {
  return isEventualCallOfKind(EventualCallKind.EmitEventsCall, a);
}

export interface EmitEventsCall
  extends EventualCallBase<EventualCallKind.EmitEventsCall, void> {
  events: EventEnvelope[];
  id?: string;
}

export function isEntityCall(a: any): a is EntityCall {
  return isEventualCallOfKind(EventualCallKind.EntityCall, a);
}

export type EntityCall<
  Op extends EntityOperation["operation"] = EntityOperation["operation"]
  // TODO: not any
> = EventualCallBase<EventualCallKind.EntityCall, any> &
  EntityOperation & { operation: Op };

export function isEntityOperationOfType<
  OpType extends EntityOperation["operation"]
>(operation: OpType, call: EntityOperation): call is EntityOperation<OpType> {
  return call.operation === operation;
}

export type EntityMethod = Exclude<
  {
    [k in keyof Entity]: [Entity[k]] extends [Function] ? k : never;
  }[keyof Entity],
  "partition" | "sort" | "stream" | "batchStream" | "index" | undefined
>;

export type EntityOperation<
  Op extends
    | EntityMethod
    | EntityTransactOperation["operation"]
    | EntityQueryIndexOperation["operation"]
    | EntityScanIndexOperation["operation"] =
    | EntityMethod
    | EntityTransactOperation["operation"]
    | EntityQueryIndexOperation["operation"]
    | EntityScanIndexOperation["operation"]
> = Op extends EntityMethod
  ? {
      operation: Op;
      entityName: string;
      params: Parameters<Entity[Op]>;
    }
  : Op extends "transact"
  ? EntityTransactOperation
  : Op extends "queryIndex"
  ? EntityQueryIndexOperation
  : EntityScanIndexOperation;

export interface EntityQueryIndexOperation {
  operation: "queryIndex";
  entityName: string;
  indexName: string;
  params: Parameters<EntityIndex["query"]>;
}

export interface EntityScanIndexOperation {
  operation: "scanIndex";
  entityName: string;
  indexName: string;
  params: Parameters<EntityIndex["scan"]>;
}

export interface EntityTransactOperation {
  operation: "transact";
  items: EntityTransactItem[];
}

export function isBucketCall(a: any): a is BucketCall {
  return isEventualCallOfKind(EventualCallKind.BucketCall, a);
}

export type BucketCall<Op extends BucketMethod = BucketMethod> =
  // todo: not any
  EventualCallBase<EventualCallKind.BucketCall, any> & BucketOperation<Op>;

export type BucketOperation<Op extends BucketMethod = BucketMethod> = {
  operation: Op;
  bucketName: string;
  params: Parameters<Bucket[Op]>;
};

export function isBucketCallType<Op extends BucketMethod>(
  op: Op,
  operation: BucketCall<any>
): operation is BucketCall<Op> {
  return operation.operation === op;
}

export function isExpectSignalCall(a: any): a is ExpectSignalCall {
  return isEventualCallOfKind(EventualCallKind.ExpectSignalCall, a);
}

export interface ExpectSignalCall
  extends EventualCallBase<EventualCallKind.ExpectSignalCall, void> {
  signalId: string;
  timeout?: Promise<any>;
}

export function isSendSignalCall(a: any): a is SendSignalCall {
  return isEventualCallOfKind(EventualCallKind.SendSignalCall, a);
}

export interface SendSignalCall
  extends EventualCallBase<EventualCallKind.SendSignalCall, void> {
  signalId: string;
  payload?: any;
  target: SignalTarget;
  id?: string;
}

export function isRegisterSignalHandlerCall(
  a: any
): a is RegisterSignalHandlerCall {
  return isEventualCallOfKind(EventualCallKind.RegisterSignalHandlerCall, a);
}

export interface RegisterSignalHandlerCall<T = any>
  extends EventualCallBase<EventualCallKind.RegisterSignalHandlerCall, void> {
  signalId: string;
  handler: (input: T) => void;
}

export function isSearchCall(a: any): a is SearchCall {
  return isEventualCallOfKind(EventualCallKind.SearchCall, a);
}

export type SearchCallRequest<Op extends SearchOperation> = Parameters<
  Extract<SearchIndex[Op], (...args: any[]) => any>
>[0];

export type SearchOperation = keyof SearchIndex;

export type SearchCall<Op extends SearchOperation = SearchOperation> =
  // TODO: not any
  EventualCallBase<EventualCallKind.SearchCall, any> & {
    operation: Op;
    request: SearchCallRequest<Op>;
  };

export function isTaskRequestCall(a: any): a is TaskRequestCall {
  return isEventualCallOfKind(EventualCallKind.TaskCall, a);
}

export type TaskMethods = Exclude<
  {
    [op in keyof Task]: [Task[op]] extends [Function] ? op : never;
  }[keyof Task],
  "handler" | undefined | "definition"
>;

export interface TaskRequestCall<Op extends TaskMethods = TaskMethods>
  // TODO: make output conditional
  extends EventualCallBase<
    EventualCallKind.TaskRequestCall,
    SendTaskHeartbeatResponse | void
  > {
  operation: Op;
  params: Parameters<Task[TaskMethods]>;
}

export function isTaskCall(a: any): a is TaskCall {
  return isEventualCallOfKind(EventualCallKind.TaskCall, a);
}

export interface TaskCall
  extends EventualCallBase<EventualCallKind.TaskCall, any> {
  name: string;
  input: any;
  heartbeat?: DurationSchedule;
  /**
   * Timeout can be any Eventual (promise). When the promise resolves, the task is considered to be timed out.
   */
  timeout?: Promise<any>;
}

export function isChildWorkflowCall(a: EventualCall): a is ChildWorkflowCall {
  return isEventualCallOfKind(EventualCallKind.WorkflowCall, a);
}

/**
 * An {@link Eventual} representing an awaited call to a {@link Workflow}.
 */
export interface ChildWorkflowCall
  extends EventualCallBase<EventualCallKind.WorkflowCall, any> {
  name: string;
  input?: any;
  opts?: WorkflowExecutionOptions;
  /**
   * An Eventual/Promise that determines when a child workflow should timeout.
   *
   * This timeout is separate from the timeout passed to the workflow (opts.timeout), which can only be a relative duration.
   *
   * TODO: support cancellation of child workflow.
   */
  timeout?: Promise<any>;
}

export function isInvokeTransactionCall(a: any): a is InvokeTransactionCall {
  return isEventualCallOfKind(EventualCallKind.InvokeTransactionCall, a);
}

export interface InvokeTransactionCall<Input = any>
  extends EventualCallBase<EventualCallKind.InvokeTransactionCall, any> {
  input: Input;
  transactionName: string;
}
