import type { Bucket } from "../bucket.js";
import type { ConditionPredicate } from "../condition.js";
import type {
  Entity,
  EntityIndex,
  EntityTransactItem,
} from "../entity/entity.js";
import type { EventEnvelope } from "../event.js";
import type { Execution, ExecutionHandle } from "../execution.js";
import type { DurationSchedule, Schedule } from "../schedule.js";
import type { SearchIndex } from "../search/search-index.js";
import type { Task } from "../task.js";
import type { Workflow, WorkflowExecutionOptions } from "../workflow.js";
import type { SignalTarget } from "./signal.js";

export type Call =
  | AwaitTimerCall
  | BucketCall
  | ChildWorkflowCall
  | ConditionCall
  | EmitEventsCall
  | EntityCall
  | ExpectSignalCall
  | GetExecutionCall
  | InvokeTransactionCall
  | SignalHandlerCall
  | SearchCall
  | SendSignalCall
  | StartWorkflowCall
  | TaskCall
  | TaskRequestCall;

export enum CallKind {
  AwaitTimerCall = 1,
  BucketCall = 10,
  ChildWorkflowCall = 7,
  ConditionCall = 2,
  EmitEventsCall = 4,
  EntityCall = 8,
  ExpectSignalCall = 3,
  GetExecutionCall = 14,
  InvokeTransactionCall = 9,
  SendSignalCall = 6,
  SignalHandlerCall = 5,
  TaskCall = 0,
  TaskRequestCall = 12,
  SearchCall = 11,
  StartWorkflowCall = 13,
}

export const CallSymbol = /* @__PURE__ */ Symbol.for("eventual:EventualCall");

export type CallOutput<E extends Call> = E extends CallBase<any, infer Output>
  ? Output
  : never;

export interface CallBase<Kind extends Call[typeof CallSymbol], Output> {
  __output: Output;
  [CallSymbol]: Kind;
}

export function createCall<E extends Call>(
  kind: E[typeof CallSymbol],
  e: Omit<E, typeof CallSymbol | "__output">
): E {
  (e as E)[CallSymbol] = kind;
  return e as E;
}

export function isCall(a: any): a is Call {
  return a && typeof a === "object" && CallSymbol in a;
}

export function isCallOfKind<E extends Call>(
  kind: E[typeof CallSymbol],
  a: any
): a is E {
  return isCall(a) && a[CallSymbol] === kind;
}

export function isAwaitTimerCall(a: any): a is AwaitTimerCall {
  return isCallOfKind(CallKind.AwaitTimerCall, a);
}

export interface AwaitTimerCall
  extends CallBase<CallKind.AwaitTimerCall, void> {
  schedule: Schedule;
}

export function isConditionCall(a: any): a is ConditionCall {
  return isCallOfKind(CallKind.ConditionCall, a);
}

export interface ConditionCall
  extends CallBase<CallKind.ConditionCall, boolean> {
  predicate: ConditionPredicate;
  timeout?: Promise<any>;
}

export function isEmitEventsCall(a: any): a is EmitEventsCall {
  return isCallOfKind(CallKind.EmitEventsCall, a);
}

export interface EmitEventsCall
  extends CallBase<CallKind.EmitEventsCall, void> {
  events: EventEnvelope[];
  id?: string;
}

export function isEntityCall(a: any): a is EntityCall {
  return isCallOfKind(CallKind.EntityCall, a);
}

export type EntityCallOutput<
  Op extends EntityOperation["operation"] = EntityOperation["operation"]
> = Op extends EntityMethod
  ? ReturnType<Entity[Op]>
  : Op extends "transact"
  ? void
  : Op extends "queryIndex"
  ? ReturnType<EntityIndex["query"]>
  : ReturnType<EntityIndex["scan"]>;

export type EntityCall<
  Op extends EntityOperation["operation"] = EntityOperation["operation"]
> = CallBase<CallKind.EntityCall, EntityCallOutput<Op>> & {
  operation: EntityOperation & { operation: Op };
};

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

export interface EntityTransactEventOperationItem
  extends Omit<EntityTransactItem, "entity"> {
  entity: string;
}

export interface EntityTransactOperation {
  operation: "transact";
  items: EntityTransactEventOperationItem[];
}

export interface BucketDefinition {
  name: string;
}

export type BucketMethod = Exclude<
  {
    [k in keyof Bucket]: Bucket[k] extends Function ? k : never;
  }[keyof Bucket],
  "on"
>;

export function isBucketCall(a: any): a is BucketCall {
  return isCallOfKind(CallKind.BucketCall, a);
}

export type BucketCall<Op extends BucketMethod = BucketMethod> = CallBase<
  CallKind.BucketCall,
  ReturnType<Bucket[Op]>
> & {
  operation: BucketOperation<Op>;
};

export type BucketOperation<Op extends BucketMethod = BucketMethod> = {
  operation: Op;
  bucketName: string;
  params: Parameters<Bucket[Op]>;
};

export function isBucketCallOperation<Op extends BucketMethod>(
  op: Op,
  operation: BucketCall<any>
): operation is BucketCall<Op> {
  return operation.operation.operation === op;
}

export function isExpectSignalCall(a: any): a is ExpectSignalCall {
  return isCallOfKind(CallKind.ExpectSignalCall, a);
}

export interface ExpectSignalCall
  extends CallBase<CallKind.ExpectSignalCall, void> {
  signalId: string;
  timeout?: Promise<any>;
}

export function isSendSignalCall(a: any): a is SendSignalCall {
  return isCallOfKind(CallKind.SendSignalCall, a);
}

export interface SendSignalCall
  extends CallBase<CallKind.SendSignalCall, void> {
  signalId: string;
  payload?: any;
  target: SignalTarget;
  id?: string;
}

export function isSignalHandlerCall(a: any): a is SignalHandlerCall {
  return isCallOfKind(CallKind.SignalHandlerCall, a);
}

export interface SignalHandlerCall<T = any>
  extends CallBase<CallKind.SignalHandlerCall, void> {
  operation:
    | {
        operation: "register";
        signalId: string;
        handler: (input: T) => void;
      }
    | {
        operation: "dispose";
        seq: number;
      };
}

export function isSearchCall(a: any): a is SearchCall {
  return isCallOfKind(CallKind.SearchCall, a);
}

export type SearchCallRequest<Op extends SearchOperation> = Parameters<
  Extract<SearchIndex[Op], (...args: any[]) => any>
>[0];

export type SearchOperation = Exclude<
  {
    [op in keyof SearchIndex]: [SearchIndex[op]] extends [Function]
      ? op
      : never;
  }[keyof SearchIndex],
  undefined
>;

export type SearchCall<Op extends SearchOperation = SearchOperation> = CallBase<
  CallKind.SearchCall,
  ReturnType<SearchIndex[Op]>
> & {
  operation: Op;
  request: SearchCallRequest<Op>;
  indexName: string;
};

export function isTaskRequestCall(a: any): a is TaskRequestCall {
  return isCallOfKind(CallKind.TaskRequestCall, a);
}

export function isTaskRequestCallOperation<O extends TaskMethods>(
  a: any,
  Op: O
): a is TaskRequestCall<O> {
  return isTaskRequestCall(a) && a.operation === Op;
}

export type TaskMethods = Exclude<
  {
    [op in keyof Task]: [Task[op]] extends [Function] ? op : never;
  }[keyof Task],
  "handler" | undefined | "definition"
>;

export interface TaskRequestCall<Op extends TaskMethods = TaskMethods>
  extends CallBase<CallKind.TaskRequestCall, ReturnType<Task[Op]>> {
  operation: Op;
  params: Parameters<Task[Op]>;
}

export function isTaskCall(a: any): a is TaskCall {
  return isCallOfKind(CallKind.TaskCall, a);
}

export interface TaskCall extends CallBase<CallKind.TaskCall, any> {
  name: string;
  input: any;
  heartbeat?: DurationSchedule;
  /**
   * Timeout can be any Eventual (promise). When the promise resolves, the task is considered to be timed out.
   */
  timeout?: Promise<any>;
}

export function isChildWorkflowCall(a: Call): a is ChildWorkflowCall {
  return isCallOfKind(CallKind.ChildWorkflowCall, a);
}

/**
 * A {@link Call} representing an awaited call to a {@link Workflow}.
 */
export interface ChildWorkflowCall
  extends CallBase<CallKind.ChildWorkflowCall, any> {
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

export function isStartWorkflowCall(a: Call): a is StartWorkflowCall {
  return isCallOfKind(CallKind.StartWorkflowCall, a);
}

/**
 * An starts a {@link Workflow}, but does not wait for it.
 */
export interface StartWorkflowCall<W extends Workflow = any>
  extends CallBase<CallKind.StartWorkflowCall, ExecutionHandle<W>> {
  name: string;
  input?: any;
  opts?: WorkflowExecutionOptions;
}

export function isGetExecutionCall(a: Call): a is GetExecutionCall {
  return isCallOfKind(CallKind.GetExecutionCall, a);
}

/**
 * An starts a {@link Workflow}, but does not wait for it.
 */
export interface GetExecutionCall
  extends CallBase<CallKind.GetExecutionCall, Execution> {
  executionId: string;
}

export function isInvokeTransactionCall(a: any): a is InvokeTransactionCall {
  return isCallOfKind(CallKind.InvokeTransactionCall, a);
}

export interface InvokeTransactionCall<Input = any>
  extends CallBase<CallKind.InvokeTransactionCall, any> {
  input: Input;
  transactionName: string;
}
