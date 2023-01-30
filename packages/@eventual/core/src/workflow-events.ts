import { ulid } from "ulidx";
import { ExecutionContext } from "./context.js";
import { EventEnvelope } from "./event.js";
import { or } from "./util.js";

export interface BaseEvent {
  type: WorkflowEventType;
  id: string;
  timestamp: string;
}

/**
 * Common fields for events that {@link Eventual} actives with in order semantics.
 */
export interface HistoryEventBase extends Omit<BaseEvent, "id"> {
  seq: number;
}

export enum WorkflowEventType {
  ActivitySucceeded = "ActivitySucceeded",
  ActivityFailed = "ActivityFailed",
  ActivityHeartbeatTimedOut = "ActivityHeartbeatTimedOut",
  ActivityScheduled = "ActivityScheduled",
  ChildWorkflowSucceeded = "ChildWorkflowSucceeded",
  ChildWorkflowFailed = "ChildWorkflowFailed",
  ChildWorkflowScheduled = "ChildWorkflowScheduled",
  EventsPublished = "EventsPublished",
  SignalReceived = "SignalReceived",
  SignalSent = "SignalSent",
  TimerCompleted = "TimerCompleted",
  TimerScheduled = "TimerScheduled",
  WorkflowSucceeded = "WorkflowSucceeded",
  WorkflowFailed = "WorkflowFailed",
  WorkflowStarted = "WorkflowStarted",
  WorkflowRunCompleted = "WorkflowRunCompleted",
  WorkflowRunStarted = "WorkflowRunStarted",
  WorkflowTimedOut = "WorkflowTimedOut",
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

export type ScheduledEvent =
  | ActivityScheduled
  | TimerScheduled
  | ChildWorkflowScheduled
  | EventsPublished
  | SignalSent;

export type SucceededEvent =
  | ActivitySucceeded
  | TimerCompleted
  | ChildWorkflowSucceeded;

export type FailedEvent =
  | ActivityFailed
  | ActivityHeartbeatTimedOut
  | ChildWorkflowFailed;

/**
 * Events generated outside of the interpreter which progress the workflow.
 */
export type HistoryResultEvent =
  | FailedEvent
  | SucceededEvent
  | SignalReceived
  | WorkflowTimedOut
  | WorkflowRunStarted;

export function isHistoryResultEvent(
  event: WorkflowEvent
): event is HistoryResultEvent {
  return (
    isSucceededEvent(event) ||
    isFailedEvent(event) ||
    isSignalReceived(event) ||
    isWorkflowTimedOut(event) ||
    isWorkflowRunStarted(event)
  );
}

/**
 * Events used by the workflow to replay an execution.
 */
export type HistoryEvent = HistoryResultEvent | ScheduledEvent;

export function isHistoryEvent(event: WorkflowEvent): event is HistoryEvent {
  return isHistoryResultEvent(event) || isScheduledEvent(event);
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

export interface WorkflowStarted extends BaseEvent {
  type: WorkflowEventType.WorkflowStarted;
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
  context: Omit<ExecutionContext, "id" | "startTime">;
}
export interface WorkflowRunStarted extends BaseEvent {
  type: WorkflowEventType.WorkflowRunStarted;
  /**
   * An execution ID of the parent workflow execution that
   * started this workflow if this is a child workflow.
   */
  parent?: string;
}

export interface ActivityScheduled extends HistoryEventBase {
  type: WorkflowEventType.ActivityScheduled;
  name: string;
}

export interface ActivitySucceeded extends HistoryEventBase {
  type: WorkflowEventType.ActivitySucceeded;
  result: any;
}

export interface ActivityFailed extends HistoryEventBase {
  type: WorkflowEventType.ActivityFailed;
  error: string;
  message?: string;
}

export interface ActivityHeartbeatTimedOut extends HistoryEventBase {
  type: WorkflowEventType.ActivityHeartbeatTimedOut;
}

export interface WorkflowRunCompleted extends BaseEvent {
  type: WorkflowEventType.WorkflowRunCompleted;
}

export interface WorkflowSucceeded extends BaseEvent {
  type: WorkflowEventType.WorkflowSucceeded;
  output: any;
}

export interface WorkflowFailed extends BaseEvent {
  type: WorkflowEventType.WorkflowFailed;
  error: string;
  message: string;
}

export interface ChildWorkflowScheduled extends HistoryEventBase {
  type: WorkflowEventType.ChildWorkflowScheduled;
  name: string;
  input?: any;
}

export interface ChildWorkflowSucceeded extends HistoryEventBase {
  type: WorkflowEventType.ChildWorkflowSucceeded;
  result: any;
}

export interface ChildWorkflowFailed extends HistoryEventBase {
  type: WorkflowEventType.ChildWorkflowFailed;
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

export function isActivityScheduled(
  event: WorkflowEvent
): event is ActivityScheduled {
  return event.type === WorkflowEventType.ActivityScheduled;
}

export function isActivitySucceeded(
  event: WorkflowEvent
): event is ActivitySucceeded {
  return event.type === WorkflowEventType.ActivitySucceeded;
}

export function isActivityFailed(
  event: WorkflowEvent
): event is ActivityFailed {
  return event.type === WorkflowEventType.ActivityFailed;
}

export function isActivityHeartbeatTimedOut(
  event: WorkflowEvent
): event is ActivityHeartbeatTimedOut {
  return event.type === WorkflowEventType.ActivityHeartbeatTimedOut;
}

export interface TimerScheduled extends HistoryEventBase {
  type: WorkflowEventType.TimerScheduled;
  untilTime: string;
}

export function isTimerScheduled(
  event: WorkflowEvent
): event is TimerScheduled {
  return event.type === WorkflowEventType.TimerScheduled;
}

export interface TimerCompleted extends HistoryEventBase {
  type: WorkflowEventType.TimerCompleted;
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
  event: WorkflowEvent
): event is ChildWorkflowScheduled {
  return event.type === WorkflowEventType.ChildWorkflowScheduled;
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

export interface SignalReceived<Payload = any> extends BaseEvent {
  type: WorkflowEventType.SignalReceived;
  signalId: string;
  payload?: Payload;
}

export function isSignalReceived(
  event: WorkflowEvent
): event is SignalReceived {
  return event.type === WorkflowEventType.SignalReceived;
}

export interface SignalSent extends HistoryEventBase {
  type: WorkflowEventType.SignalSent;
  payload?: any;
  signalId: string;
  executionId: string;
}

export function isSignalSent(event: WorkflowEvent): event is SignalSent {
  return event.type === WorkflowEventType.SignalSent;
}

export interface EventsPublished extends HistoryEventBase {
  type: WorkflowEventType.EventsPublished;
  events: EventEnvelope[];
}

export function isEventsPublished(
  event: WorkflowEvent
): event is EventsPublished {
  return event.type === WorkflowEventType.EventsPublished;
}

export interface WorkflowTimedOut extends BaseEvent {
  type: WorkflowEventType.WorkflowTimedOut;
}

export function isWorkflowTimedOut(
  event: WorkflowEvent
): event is WorkflowTimedOut {
  return event.type === WorkflowEventType.WorkflowTimedOut;
}

export const isScheduledEvent = or(
  isActivityScheduled,
  isChildWorkflowScheduled,
  isEventsPublished,
  isSignalSent,
  isTimerScheduled
);

export const isSucceededEvent = or(
  isActivitySucceeded,
  isChildWorkflowSucceeded,
  isTimerCompleted
);

export const isFailedEvent = or(
  isActivityFailed,
  isActivityHeartbeatTimedOut,
  isChildWorkflowFailed,
  isWorkflowTimedOut
);

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
  if (isHistoryEvent(event) && "seq" in event) {
    return `${event.seq}_${event.type}`;
  } else {
    return event.id;
  }
}

type UnresolvedEvent<T extends WorkflowEvent> = Omit<T, "id" | "timestamp">;

export function createEvent<T extends WorkflowEvent>(
  event: UnresolvedEvent<T>,
  time: Date,
  id: string = ulid()
): T {
  const timestamp = time.toISOString();

  // history events do not have IDs, use getEventId
  if (
    isHistoryEvent(event as unknown as WorkflowEvent) &&
    !isSignalReceived(event as unknown as WorkflowEvent) &&
    !isWorkflowRunStarted(event as unknown as WorkflowEvent) &&
    !isWorkflowTimedOut(event as unknown as WorkflowEvent)
  ) {
    return { ...(event as any), timestamp };
  }

  return { ...event, id, timestamp } as T;
}
