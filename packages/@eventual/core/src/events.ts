import { ExecutionContext } from "./context.js";
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
  ActivityScheduled = "ActivityScheduled",
  SleepScheduled = "SleepScheduled",
  SleepCompleted = "SleepCompleted",
  WorkflowTaskCompleted = "TaskCompleted",
  WorkflowTaskStarted = "TaskStarted",
  WorkflowCompleted = "WorkflowCompleted",
  WorkflowFailed = "WorkflowFailed",
  WorkflowStarted = "WorkflowStarted",
  ChildWorkflowScheduled = "ChildWorkflowScheduled",
  ChildWorkflowCompleted = "ChildWorkflowCompleted",
  ChildWorkflowFailed = "ChildWorkflowFailed",
  ExpectSignalStarted = "ExpectSignalStarted",
  ExpectSignalTimedOut = "ExpectSignalTimedOut",
  SignalReceived = "SignalReceived",
  SignalSent = "SignalSent",
  ConditionStarted = "ConditionStarted",
  ConditionTimedOut = "ConditionTimedOut",
}

/**
 * Events generated by the engine that represent the in-order state of the workflow.
 */
export type WorkflowEvent =
  | WorkflowTaskCompleted
  | WorkflowTaskStarted
  | WorkflowCompleted
  | WorkflowFailed
  | WorkflowStarted
  | HistoryEvent;

export type ScheduledEvent =
  | ActivityScheduled
  | ChildWorkflowScheduled
  | SleepScheduled
  | ExpectSignalStarted
  | SignalSent
  | ConditionStarted;

export type CompletedEvent =
  | ActivityCompleted
  | ChildWorkflowCompleted
  | SleepCompleted;

export type FailedEvent =
  | ActivityFailed
  | ChildWorkflowFailed
  | ExpectSignalTimedOut
  | ConditionTimedOut;

/**
 * Events used by the workflow to replay an execution.
 */
export type HistoryEvent =
  | ScheduledEvent
  | CompletedEvent
  | FailedEvent
  | SignalReceived;

export function isHistoryEvent(event: WorkflowEvent): event is HistoryEvent {
  return (
    isScheduledEvent(event) ||
    isFailedEvent(event) ||
    isCompletedEvent(event) ||
    isSignalReceived(event)
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
  // the time from being scheduled until the activity completes.
  duration: number;
  result: any;
}

export interface ActivityFailed extends HistoryEventBase {
  type: WorkflowEventType.ActivityFailed;
  error: string;
  // the time from being scheduled until the activity completes.
  duration: number;
  message: string;
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
  input: any;
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

export const isScheduledEvent = or(
  isActivityScheduled,
  isChildWorkflowScheduled,
  isSleepScheduled,
  isExpectSignalStarted,
  isSignalSent,
  isConditionStarted
);

export const isCompletedEvent = or(
  isActivityCompleted,
  isChildWorkflowCompleted,
  isSleepCompleted
);

export const isFailedEvent = or(
  isActivityFailed,
  isChildWorkflowFailed,
  isExpectSignalTimedOut,
  isConditionTimedOut
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
  if (isHistoryEvent(event) && !isSignalReceived(event)) {
    return `${event.seq}_${event.type}`;
  } else {
    return event.id;
  }
}

/**
 * Merges new task events with existing history events.
 *
 * We assume that history events are unique.
 *
 * Task events are taken only of their ID ({@link getEventId}) is unique across all other events.
 */
export function filterEvents<T extends WorkflowEvent>(
  historyEvents: T[],
  taskEvents: T[]
): T[] {
  const ids = new Set(historyEvents.map(getEventId));

  return [
    ...historyEvents,
    ...taskEvents.filter((event) => {
      const id = getEventId(event);
      if (ids.has(id)) {
        return false;
      }
      ids.add(id);
      return true;
    }),
  ];
}
