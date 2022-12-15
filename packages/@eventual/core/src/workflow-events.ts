import { trace } from "@opentelemetry/api";
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
  ActivityCompleted = "ActivityCompleted",
  ActivityFailed = "ActivityFailed",
  ActivityHeartbeatTimedOut = "ActivityHeartbeatTimedOut",
  ActivityScheduled = "ActivityScheduled",
  ActivityTimedOut = "ActivityTimedOut",
  ChildWorkflowCompleted = "ChildWorkflowCompleted",
  ChildWorkflowFailed = "ChildWorkflowFailed",
  ChildWorkflowScheduled = "ChildWorkflowScheduled",
  ConditionStarted = "ConditionStarted",
  ConditionTimedOut = "ConditionTimedOut",
  EventsPublished = "EventsPublished",
  ExpectSignalStarted = "ExpectSignalStarted",
  ExpectSignalTimedOut = "ExpectSignalTimedOut",
  SignalReceived = "SignalReceived",
  SignalSent = "SignalSent",
  SleepCompleted = "SleepCompleted",
  SleepScheduled = "SleepScheduled",
  WorkflowCompleted = "WorkflowCompleted",
  WorkflowFailed = "WorkflowFailed",
  WorkflowStarted = "WorkflowStarted",
  WorkflowTaskCompleted = "TaskCompleted",
  WorkflowTaskStarted = "TaskStarted",
  WorkflowTimedOut = "WorkflowTimedOut",
}

/**
 * Events generated by the engine that represent the in-order state of the workflow.
 */
export type WorkflowEvent =
  | HistoryEvent
  | WorkflowTaskCompleted
  | WorkflowTaskStarted
  | WorkflowCompleted
  | WorkflowFailed
  | WorkflowStarted;

export type ScheduledEvent =
  | ActivityScheduled
  | ChildWorkflowScheduled
  | ConditionStarted
  | EventsPublished
  | ExpectSignalStarted
  | SignalSent
  | SleepScheduled;

export type CompletedEvent =
  | ActivityCompleted
  | ChildWorkflowCompleted
  | SleepCompleted;

export type FailedEvent =
  | ActivityFailed
  | ActivityHeartbeatTimedOut
  | ActivityTimedOut
  | ChildWorkflowFailed
  | ConditionTimedOut
  | ExpectSignalTimedOut;

/**
 * Events used by the workflow to replay an execution.
 */
export type HistoryEvent =
  | CompletedEvent
  | FailedEvent
  | ScheduledEvent
  | SignalReceived
  | WorkflowTimedOut;

export function isHistoryEvent(event: WorkflowEvent): event is HistoryEvent {
  return (
    isCompletedEvent(event) ||
    isFailedEvent(event) ||
    isScheduledEvent(event) ||
    isSignalReceived(event) ||
    isWorkflowTimedOut(event)
  );
}

/**
 * Events that we save into history.
 */
export type HistoryStateEvent = HistoryEvent | WorkflowStarted;

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
export interface WorkflowTaskStarted extends BaseEvent {
  type: WorkflowEventType.WorkflowTaskStarted;
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

export interface ActivityCompleted extends HistoryEventBase {
  type: WorkflowEventType.ActivityCompleted;
  result: any;
}

export interface ActivityFailed extends HistoryEventBase {
  type: WorkflowEventType.ActivityFailed;
  error: string;
  message: string;
}

export interface ActivityHeartbeatTimedOut extends HistoryEventBase {
  type: WorkflowEventType.ActivityHeartbeatTimedOut;
}

export interface WorkflowTaskCompleted extends BaseEvent {
  type: WorkflowEventType.WorkflowTaskCompleted;
}

export interface WorkflowCompleted extends BaseEvent {
  type: WorkflowEventType.WorkflowCompleted;
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

export interface ChildWorkflowCompleted extends HistoryEventBase {
  type: WorkflowEventType.ChildWorkflowCompleted;
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

export function isTaskStarted(
  event: WorkflowEvent
): event is WorkflowTaskStarted {
  return event.type === WorkflowEventType.WorkflowTaskStarted;
}

export function isActivityScheduled(
  event: WorkflowEvent
): event is ActivityScheduled {
  return event.type === WorkflowEventType.ActivityScheduled;
}

export function isActivityCompleted(
  event: WorkflowEvent
): event is ActivityCompleted {
  return event.type === WorkflowEventType.ActivityCompleted;
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

export interface SleepScheduled extends HistoryEventBase {
  type: WorkflowEventType.SleepScheduled;
  untilTime: string;
}

export function isSleepScheduled(
  event: WorkflowEvent
): event is SleepScheduled {
  return event.type === WorkflowEventType.SleepScheduled;
}

export interface SleepCompleted extends HistoryEventBase {
  type: WorkflowEventType.SleepCompleted;
  result?: undefined;
}

export interface WorkflowTaskCompleted extends BaseEvent {
  type: WorkflowEventType.WorkflowTaskCompleted;
}

export function isTaskCompleted(
  event: WorkflowEvent
): event is WorkflowTaskCompleted {
  return event.type === WorkflowEventType.WorkflowTaskCompleted;
}

export interface WorkflowCompleted extends BaseEvent {
  type: WorkflowEventType.WorkflowCompleted;
  output: any;
}

export function isWorkflowCompleted(
  event: WorkflowEvent
): event is WorkflowCompleted {
  return event.type === WorkflowEventType.WorkflowCompleted;
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
export function isChildWorkflowCompleted(
  event: WorkflowEvent
): event is ChildWorkflowCompleted {
  return event.type === WorkflowEventType.ChildWorkflowCompleted;
}
export function isChildWorkflowFailed(
  event: WorkflowEvent
): event is ChildWorkflowFailed {
  return event.type === WorkflowEventType.ChildWorkflowFailed;
}

export function isSleepCompleted(
  event: WorkflowEvent
): event is SleepCompleted {
  return event.type === WorkflowEventType.SleepCompleted;
}

export interface ExpectSignalStarted extends HistoryEventBase {
  type: WorkflowEventType.ExpectSignalStarted;
  signalId: string;
  timeoutSeconds?: number;
}

export interface ExpectSignalTimedOut extends HistoryEventBase {
  type: WorkflowEventType.ExpectSignalTimedOut;
  signalId: string;
}

export interface SignalReceived<Payload = any> extends BaseEvent {
  type: WorkflowEventType.SignalReceived;
  signalId: string;
  payload?: Payload;
}

export function isExpectSignalStarted(
  event: WorkflowEvent
): event is ExpectSignalStarted {
  return event.type === WorkflowEventType.ExpectSignalStarted;
}

export function isExpectSignalTimedOut(
  event: WorkflowEvent
): event is ExpectSignalTimedOut {
  return event.type === WorkflowEventType.ExpectSignalTimedOut;
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

export interface ConditionStarted extends HistoryEventBase {
  type: WorkflowEventType.ConditionStarted;
}

export function isConditionStarted(
  event: WorkflowEvent
): event is ConditionStarted {
  return event.type === WorkflowEventType.ConditionStarted;
}

export interface ConditionTimedOut extends HistoryEventBase {
  type: WorkflowEventType.ConditionTimedOut;
}

export function isConditionTimedOut(
  event: WorkflowEvent
): event is ConditionTimedOut {
  return event.type === WorkflowEventType.ConditionTimedOut;
}

export interface ActivityTimedOut extends HistoryEventBase {
  type: WorkflowEventType.ActivityTimedOut;
}

export interface WorkflowTimedOut extends BaseEvent {
  type: WorkflowEventType.WorkflowTimedOut;
}

export function isActivityTimedOut(
  event: WorkflowEvent
): event is ActivityTimedOut {
  return event.type === WorkflowEventType.ActivityTimedOut;
}

export function isWorkflowTimedOut(
  event: WorkflowEvent
): event is WorkflowTimedOut {
  return event.type === WorkflowEventType.WorkflowTimedOut;
}

export const isScheduledEvent = or(
  isActivityScheduled,
  isChildWorkflowScheduled,
  isConditionStarted,
  isEventsPublished,
  isExpectSignalStarted,
  isSignalSent,
  isSleepScheduled
);

export const isCompletedEvent = or(
  isActivityCompleted,
  isChildWorkflowCompleted,
  isSleepCompleted
);

export const isFailedEvent = or(
  isActivityFailed,
  isActivityTimedOut,
  isActivityHeartbeatTimedOut,
  isChildWorkflowFailed,
  isConditionTimedOut,
  isExpectSignalTimedOut,
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
  if (
    isHistoryEvent(event) &&
    !isSignalReceived(event) &&
    !isWorkflowTimedOut(event)
  ) {
    return `${event.seq}_${event.type}`;
  } else {
    return event.id;
  }
}

/**
 * Filters out events that are also present in origin events.
 *
 * Events are taken only if their ID ({@link getEventId}) is unique across all other events.
 */
export function filterEvents<T extends WorkflowEvent>(
  originEvents: T[],
  events: T[]
): T[] {
  const ids = new Set(originEvents.map(getEventId));

  return events.filter((event) => {
    const id = getEventId(event);
    if (ids.has(id)) {
      return false;
    }
    ids.add(id);
    return true;
  });
}

type UnresolvedEvent<T extends WorkflowEvent> = Omit<T, "id" | "timestamp">;

export function createEvent<T extends WorkflowEvent>(
  event: UnresolvedEvent<T>,
  time: Date = new Date(),
  id: string = ulid()
): T {
  trace
    .getActiveSpan()
    ?.addEvent(event.type, { event: JSON.stringify(event) }, time);
  const timestamp = time.toISOString();

  // history events do not have IDs, use getEventId
  if (
    isHistoryEvent(event as unknown as WorkflowEvent) &&
    !isSignalReceived(event as unknown as WorkflowEvent)
  ) {
    return { ...(event as any), timestamp };
  }

  return { ...event, id, timestamp } as T;
}
