import type { Bucket, GetBucketObjectResponse } from "../bucket.js";
import type { EventEnvelope } from "../event.js";
import type { Schedule } from "../schedule.js";
import type { WorkflowExecutionContext } from "../workflow.js";
import type {
  BucketMethod,
  BucketOperation,
  EntityOperation,
  QueueOperation,
  SearchOperation,
} from "./calls.js";
import type { SignalTarget } from "./signal.js";
import { or } from "./util.js";

export interface BaseEvent<T extends WorkflowEventType = WorkflowEventType> {
  type: T;
  id: string;
  timestamp: string;
}

/**
 * Common fields for events that {@link Eventual} actives with in order semantics.
 */
export interface CallEventResultBase<
  T extends WorkflowEventType = WorkflowEventType
> extends Omit<BaseEvent<T>, "id"> {
  seq: number;
}

export interface CallEventBase<
  T extends WorkflowCallHistoryType = WorkflowCallHistoryType
> {
  type: T;
  seq: number;
}

/**
 * Workflow Event Types
 *
 * The numeric ID is also used to determine display order.
 *
 * 0-9 reserved
 * 10 - Workflow started
 * 15 - Workflow run stated
 * 16 > 19 - Padding
 * 20 - Call Event
 * 21-23 - Open
 * 24 - Signal Received
 * 25-49 - Open
 * 50 > 79 (current max: 61) - Completed Events
 * 80 - Workflow Run Completed
 * 81 > 89 - Padding
 * 90 - Workflow Timed Out
 * 91 - Workflow Succeeded
 * 92 - Workflow Failed
 */
export enum WorkflowEventType {
  BucketRequestFailed = 60,
  BucketRequestSucceeded = 61,
  CallEvent = 20,
  ChildWorkflowSucceeded = 50,
  ChildWorkflowFailed = 51,
  EntityRequestFailed = 52,
  EntityRequestSucceeded = 53,
  QueueRequestSucceeded = 56,
  QueueRequestFailed = 64,
  SignalReceived = 24,
  TaskSucceeded = 46,
  TaskFailed = 57,
  TaskHeartbeatTimedOut = 58,
  TimerCompleted = 59,
  TransactionRequestFailed = 54,
  TransactionRequestSucceeded = 55,
  WorkflowSucceeded = 95,
  WorkflowFailed = 96,
  WorkflowStarted = 10,
  WorkflowRunCompleted = 80,
  WorkflowRunStarted = 15,
  WorkflowTimedOut = 90,
  SearchRequestSucceeded = 62,
  SearchRequestFailed = 63,
}

export enum WorkflowCallHistoryType {
  BucketRequest = 0,
  QueueRequest = 10,
  ChildWorkflowScheduled = 1,
  EntityRequest = 2,
  EventsEmitted = 3,
  SearchRequest = 4,
  SignalSent = 5,
  SocketMessageSent = 11,
  TaskScheduled = 7,
  TimerScheduled = 8,
  TransactionRequest = 9,
}

/**
 * Events generated by the engine that represent the in-order state of the workflow.
 */
export type WorkflowEvent =
  | HistoryEvent
  | WorkflowRunCompleted
  | WorkflowSucceeded
  | WorkflowFailed
  | WorkflowStarted;

/**
 * Events generated by the workflow to maintain deterministic executions.
 */
export type WorkflowCallHistoryEvent =
  | BucketRequest
  | ChildWorkflowScheduled
  | SearchRequest
  | EntityRequest
  | EventsEmitted
  | QueueRequest
  | SignalSent
  | SocketMessageSent
  | TaskScheduled
  | TimerScheduled
  | TransactionRequest;

/**
 * Events generated outside of the interpreter which progress the workflow.
 */
export type CompletionEvent =
  | BucketRequestSucceeded
  | BucketRequestFailed
  | ChildWorkflowFailed
  | ChildWorkflowSucceeded
  | EntityRequestFailed
  | EntityRequestSucceeded
  | QueueRequestSucceeded
  | QueueRequestFailed
  | SignalReceived
  | SearchRequestSucceeded
  | SearchRequestFailed
  | TaskFailed
  | TaskHeartbeatTimedOut
  | TaskSucceeded
  | TimerCompleted
  | TransactionRequestSucceeded
  | TransactionRequestFailed
  | WorkflowTimedOut
  | WorkflowRunStarted;

/**
 * All events which can be input into the workflow.
 */
export type WorkflowInputEvent = HistoryEvent | WorkflowStarted;

export const isCompletionEvent = /* @__PURE__ */ or(
  isBucketRequestFailed,
  isBucketRequestSucceeded,
  isChildWorkflowFailed,
  isChildWorkflowSucceeded,
  isEntityRequestFailed,
  isEntityRequestSucceeded,
  isQueueRequestFailed,
  isQueueRequestSucceeded,
  isSignalReceived,
  isTaskSucceeded,
  isTaskFailed,
  isTaskHeartbeatTimedOut,
  isTimerCompleted,
  isTransactionRequestFailed,
  isTransactionRequestSucceeded,
  isWorkflowTimedOut,
  isWorkflowRunStarted,
  isSearchRequestFailed,
  isSearchRequestSucceeded
);

/**
 * Events used by the workflow to replay an execution.
 */
export type HistoryEvent = CompletionEvent | CallEvent;

export function isHistoryEvent(event: WorkflowEvent): event is HistoryEvent {
  return isCompletionEvent(event) || isCallEvent(event);
}

/**
 * Events that we save into history.
 */
export type HistoryStateEvent =
  | HistoryEvent
  | WorkflowStarted
  | WorkflowSucceeded
  | WorkflowFailed;

export function isHistoryStateEvent(
  event: WorkflowEvent
): event is HistoryStateEvent {
  return (
    isHistoryEvent(event) ||
    isWorkflowStarted(event) ||
    isWorkflowSucceeded(event) ||
    isWorkflowFailed(event)
  );
}

export function isCallEvent(event: WorkflowEvent): event is CallEvent {
  return event.type === WorkflowEventType.CallEvent;
}

export interface CallEvent<
  E extends WorkflowCallHistoryEvent = WorkflowCallHistoryEvent
> extends Omit<BaseEvent<WorkflowEventType.CallEvent>, "id"> {
  event: E;
}

export interface WorkflowStarted
  extends BaseEvent<WorkflowEventType.WorkflowStarted> {
  /**
   * Name of the workflow to execute.
   */
  workflowName: string;
  /**
   * Input payload for the workflow function.
   */
  input?: any;
  /**
   * Optional ISO timestamp after which the workflow should timeout.
   */
  timeoutTime?: string;
  context: Omit<WorkflowExecutionContext, "id" | "startTime">;
}
export type WorkflowRunStarted =
  BaseEvent<WorkflowEventType.WorkflowRunStarted>;

export interface TaskScheduled
  extends CallEventBase<WorkflowCallHistoryType.TaskScheduled> {
  name: string;
  input?: any;
}

export interface TaskSucceeded
  extends CallEventResultBase<WorkflowEventType.TaskSucceeded> {
  result: any;
}

export interface TaskFailed
  extends CallEventResultBase<WorkflowEventType.TaskFailed> {
  error: string;
  message?: string;
}

export type TaskHeartbeatTimedOut =
  CallEventResultBase<WorkflowEventType.TaskHeartbeatTimedOut>;

export type WorkflowRunCompleted =
  BaseEvent<WorkflowEventType.WorkflowRunCompleted>;

export interface WorkflowSucceeded
  extends BaseEvent<WorkflowEventType.WorkflowSucceeded> {
  output: any;
}

export interface WorkflowFailed
  extends BaseEvent<WorkflowEventType.WorkflowFailed> {
  error: string;
  message: string;
}

export interface ChildWorkflowScheduled
  extends CallEventBase<WorkflowCallHistoryType.ChildWorkflowScheduled> {
  name: string;
  input?: any;
}

export interface ChildWorkflowSucceeded
  extends CallEventResultBase<WorkflowEventType.ChildWorkflowSucceeded> {
  result: any;
}

export interface ChildWorkflowFailed
  extends CallEventResultBase<WorkflowEventType.ChildWorkflowFailed> {
  error: string;
  message: string;
}

export function isWorkflowStarted(
  event: WorkflowEvent
): event is WorkflowStarted {
  return event.type === WorkflowEventType.WorkflowStarted;
}

export function isWorkflowRunStarted(
  event: WorkflowEvent
): event is WorkflowRunStarted {
  return event.type === WorkflowEventType.WorkflowRunStarted;
}

export function isTaskScheduled(
  event: WorkflowCallHistoryEvent
): event is TaskScheduled {
  return event.type === WorkflowCallHistoryType.TaskScheduled;
}

export function isTaskSucceeded(event: WorkflowEvent): event is TaskSucceeded {
  return event.type === WorkflowEventType.TaskSucceeded;
}

export function isTaskFailed(event: WorkflowEvent): event is TaskFailed {
  return event.type === WorkflowEventType.TaskFailed;
}

export function isTaskHeartbeatTimedOut(
  event: WorkflowEvent
): event is TaskHeartbeatTimedOut {
  return event.type === WorkflowEventType.TaskHeartbeatTimedOut;
}

export interface QueueRequest
  extends CallEventBase<WorkflowCallHistoryType.QueueRequest> {
  type: WorkflowCallHistoryType.QueueRequest;
  operation: QueueOperation;
}

export interface QueueRequestSucceeded
  extends CallEventResultBase<WorkflowEventType.QueueRequestSucceeded> {
  name?: string;
  operation: QueueOperation["operation"];
  result: any;
}

export interface QueueRequestFailed
  extends CallEventResultBase<WorkflowEventType.QueueRequestFailed> {
  operation: QueueOperation["operation"];
  name?: string;
  error: string;
  message: string;
}

export function isQueueRequest(
  event: WorkflowCallHistoryEvent
): event is QueueRequest {
  return event.type === WorkflowCallHistoryType.QueueRequest;
}

export function isQueueRequestSucceeded(
  event: WorkflowEvent
): event is QueueRequestSucceeded {
  return event.type === WorkflowEventType.QueueRequestSucceeded;
}

export function isQueueRequestFailed(
  event: WorkflowEvent
): event is QueueRequestFailed {
  return event.type === WorkflowEventType.QueueRequestFailed;
}

export interface EntityRequest
  extends CallEventBase<WorkflowCallHistoryType.EntityRequest> {
  operation: EntityOperation;
}

export interface EntityRequestSucceeded
  extends CallEventResultBase<WorkflowEventType.EntityRequestSucceeded> {
  name?: string;
  operation: EntityOperation["operation"];
  result: any;
}

export interface EntityRequestFailed
  extends CallEventResultBase<WorkflowEventType.EntityRequestFailed> {
  operation: EntityOperation["operation"];
  name?: string;
  error: string;
  message: string;
}

export function isEntityRequest(
  event: WorkflowCallHistoryEvent
): event is EntityRequest {
  return event.type === WorkflowCallHistoryType.EntityRequest;
}

export function isEntityRequestSucceeded(
  event: WorkflowEvent
): event is EntityRequestSucceeded {
  return event.type === WorkflowEventType.EntityRequestSucceeded;
}

export function isEntityRequestFailed(
  event: WorkflowEvent
): event is EntityRequestFailed {
  return event.type === WorkflowEventType.EntityRequestFailed;
}

export interface TransactionRequest
  extends CallEventBase<WorkflowCallHistoryType.TransactionRequest> {
  input: any;
  transactionName: string;
}

export interface TransactionRequestSucceeded
  extends CallEventResultBase<WorkflowEventType.TransactionRequestSucceeded> {
  result: any;
}

export interface TransactionRequestFailed
  extends CallEventResultBase<WorkflowEventType.TransactionRequestFailed> {
  error: string;
  message: string;
}

export function isTransactionRequest(
  event: WorkflowCallHistoryEvent
): event is TransactionRequest {
  return event.type === WorkflowCallHistoryType.TransactionRequest;
}

export function isTransactionRequestSucceeded(
  event: WorkflowEvent
): event is TransactionRequestSucceeded {
  return event.type === WorkflowEventType.TransactionRequestSucceeded;
}

export function isTransactionRequestFailed(
  event: WorkflowEvent
): event is TransactionRequestFailed {
  return event.type === WorkflowEventType.TransactionRequestFailed;
}

export interface BucketRequest
  extends CallEventBase<WorkflowCallHistoryType.BucketRequest> {
  operation:
    | BucketOperation<Exclude<BucketMethod, "put">>
    | {
        bucketName: string;
        operation: "put";
        key: string;
      };
}

export interface BucketGetObjectSerializedResult
  extends Omit<GetBucketObjectResponse, "body" | "getBodyString"> {
  body: string;
  base64Encoded: boolean;
}

export type BucketOperationResult<Op extends BucketMethod = BucketMethod> =
  Op extends "get"
    ? undefined | BucketGetObjectSerializedResult
    : Awaited<ReturnType<Bucket[Op]>>;

export interface BucketRequestSucceeded<Op extends BucketMethod = BucketMethod>
  extends CallEventResultBase<WorkflowEventType.BucketRequestSucceeded> {
  name?: string;
  operation: Op;
  result: BucketOperationResult<Op>;
}

export function isBucketRequestSucceededOperationType<Op extends BucketMethod>(
  op: Op,
  event: BucketRequestSucceeded
): event is BucketRequestSucceeded<Op> {
  return event.operation === op;
}

export interface BucketRequestFailed
  extends CallEventResultBase<WorkflowEventType.BucketRequestFailed> {
  operation: BucketOperation["operation"];
  name?: string;
  error: string;
  message: string;
}

export function isBucketRequest(
  event: WorkflowCallHistoryEvent
): event is BucketRequest {
  return event.type === WorkflowCallHistoryType.BucketRequest;
}

export function isBucketRequestSucceeded(
  event: WorkflowEvent
): event is BucketRequestSucceeded {
  return event.type === WorkflowEventType.BucketRequestSucceeded;
}

export function isBucketRequestFailed(
  event: WorkflowEvent
): event is BucketRequestFailed {
  return event.type === WorkflowEventType.BucketRequestFailed;
}

export interface TimerScheduled
  extends CallEventBase<WorkflowCallHistoryType.TimerScheduled> {
  schedule: Schedule;
}

export function isTimerScheduled(
  event: WorkflowCallHistoryEvent
): event is TimerScheduled {
  return event.type === WorkflowCallHistoryType.TimerScheduled;
}

export interface TimerCompleted
  extends CallEventResultBase<WorkflowEventType.TimerCompleted> {
  result?: undefined;
}

export function isWorkflowRunCompleted(
  event: WorkflowEvent
): event is WorkflowRunCompleted {
  return event.type === WorkflowEventType.WorkflowRunCompleted;
}

export function isWorkflowSucceeded(
  event: WorkflowEvent
): event is WorkflowSucceeded {
  return event.type === WorkflowEventType.WorkflowSucceeded;
}

export function isWorkflowFailed(
  event: WorkflowEvent
): event is WorkflowFailed {
  return event.type === WorkflowEventType.WorkflowFailed;
}

export function isChildWorkflowScheduled(
  event: WorkflowCallHistoryEvent
): event is ChildWorkflowScheduled {
  return event.type === WorkflowCallHistoryType.ChildWorkflowScheduled;
}
export function isChildWorkflowSucceeded(
  event: WorkflowEvent
): event is ChildWorkflowSucceeded {
  return event.type === WorkflowEventType.ChildWorkflowSucceeded;
}
export function isChildWorkflowFailed(
  event: WorkflowEvent
): event is ChildWorkflowFailed {
  return event.type === WorkflowEventType.ChildWorkflowFailed;
}

export function isTimerCompleted(
  event: WorkflowEvent
): event is TimerCompleted {
  return event.type === WorkflowEventType.TimerCompleted;
}

export const isWorkflowCompletedEvent = or(
  isWorkflowFailed,
  isWorkflowSucceeded
);

export interface SignalReceived<Payload = any>
  extends BaseEvent<WorkflowEventType.SignalReceived> {
  signalId: string;
  payload?: Payload;
}

export function isSignalReceived(
  event: WorkflowEvent
): event is SignalReceived {
  return event.type === WorkflowEventType.SignalReceived;
}

export interface SignalSent
  extends CallEventBase<WorkflowCallHistoryType.SignalSent> {
  payload?: any;
  signalId: string;
  target: SignalTarget;
}

export function isSignalSent(
  event: WorkflowCallHistoryEvent
): event is SignalSent {
  return event.type === WorkflowCallHistoryType.SignalSent;
}

export interface EventsEmitted
  extends CallEventBase<WorkflowCallHistoryType.EventsEmitted> {
  events: EventEnvelope[];
}

export function isEventsEmitted(
  event: WorkflowCallHistoryEvent
): event is EventsEmitted {
  return event.type === WorkflowCallHistoryType.EventsEmitted;
}

export interface SocketMessageSent
  extends CallEventBase<WorkflowCallHistoryType.SocketMessageSent> {
  socketName: string;
  connectionId: string;
  input: string;
  isBase64Encoded: boolean;
}

export function isSocketMessageSent(
  event: WorkflowCallHistoryEvent
): event is SocketMessageSent {
  return event.type === WorkflowCallHistoryType.SocketMessageSent;
}

export interface SearchRequest
  extends CallEventBase<WorkflowCallHistoryType.SearchRequest> {
  operation: SearchOperation;
  request: any;
}

export interface SearchRequestSucceeded
  extends CallEventResultBase<WorkflowEventType.SearchRequestSucceeded> {
  operation: SearchOperation;
  body: any;
}

export interface SearchRequestFailed
  extends CallEventResultBase<WorkflowEventType.SearchRequestFailed> {
  operation: SearchOperation;
  error: string;
  message: string;
}

export function isSearchRequest(
  event: WorkflowCallHistoryEvent
): event is SearchRequest {
  return event.type === WorkflowCallHistoryType.SearchRequest;
}

export function isSearchRequestSucceeded(
  event: WorkflowEvent
): event is SearchRequestSucceeded {
  return event.type === WorkflowEventType.SearchRequestSucceeded;
}

export function isSearchRequestFailed(
  event: WorkflowEvent
): event is SearchRequestFailed {
  return event.type === WorkflowEventType.SearchRequestFailed;
}

export type WorkflowTimedOut = BaseEvent<WorkflowEventType.WorkflowTimedOut>;

export function isWorkflowTimedOut(
  event: WorkflowEvent
): event is WorkflowTimedOut {
  return event.type === WorkflowEventType.WorkflowTimedOut;
}

export function assertEventType<T extends WorkflowEvent>(
  event: any,
  type: T["type"]
): asserts event is T {
  if (!event || event.type !== type) {
    throw new Error(`Expected event of type ${type}`);
  }
}

/**
 * Compute the ID of an event.
 *
 * Some events have a computed ID to save space.
 */
export function getEventId(event: WorkflowEvent): string {
  if (isCompletionEvent(event) && "seq" in event) {
    return `${event.seq}_${event.type}`;
  } else if (isCallEvent(event)) {
    return `${event.event.seq}_${event.type}`;
  } else {
    return event.id;
  }
}
