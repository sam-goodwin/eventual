import {
  CommandType,
  SleepForCommand,
  SleepUntilCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
  WaitForEventCommand,
} from "../src/command.js";
import {
  ActivityCompleted,
  ActivityFailed,
  ActivityScheduled,
  ChildWorkflowCompleted,
  ChildWorkflowFailed,
  ChildWorkflowScheduled,
  ExternalEvent,
  SleepCompleted,
  SleepScheduled,
  WaitForEventStarted,
  WaitForEventTimedOut,
  WorkflowEventType,
} from "../src/events.js";
import { ulid } from "ulidx";

export function createSleepUntilCommand(
  untilTime: string,
  seq: number
): SleepUntilCommand {
  return {
    kind: CommandType.SleepUntil,
    untilTime,
    seq,
  };
}

export function createSleepForCommand(
  durationSeconds: number,
  seq: number
): SleepForCommand {
  return {
    kind: CommandType.SleepFor,
    durationSeconds: durationSeconds,
    seq,
  };
}

export function createScheduledActivityCommand(
  name: string,
  args: any[],
  seq: number
): ScheduleActivityCommand {
  return {
    kind: CommandType.StartActivity,
    seq,
    name,
    args,
  };
}

export function createScheduledWorkflowCommand(
  name: string,
  input: any,
  seq: number
): ScheduleWorkflowCommand {
  return {
    kind: CommandType.StartWorkflow,
    seq,
    name,
    input,
  };
}

export function createWaitForEventCommand(
  eventId: string,
  seq: number,
  timeoutSeconds?: number
): WaitForEventCommand {
  return {
    kind: CommandType.WaitForEvent,
    eventId,
    seq,
    timeoutSeconds,
  };
}

export function activityCompleted(result: any, seq: number): ActivityCompleted {
  return {
    type: WorkflowEventType.ActivityCompleted,
    duration: 0,
    result,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function workflowCompleted(
  result: any,
  seq: number
): ChildWorkflowCompleted {
  return {
    type: WorkflowEventType.ChildWorkflowCompleted,
    result,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function activityFailed(error: any, seq: number): ActivityFailed {
  return {
    type: WorkflowEventType.ActivityFailed,
    duration: 0,
    error,
    message: "message",
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function workflowFailed(error: any, seq: number): ChildWorkflowFailed {
  return {
    type: WorkflowEventType.ChildWorkflowFailed,
    error,
    message: "message",
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function activityScheduled(
  name: string,
  seq: number
): ActivityScheduled {
  return {
    type: WorkflowEventType.ActivityScheduled,
    name,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function workflowScheduled(
  name: string,
  seq: number
): ChildWorkflowScheduled {
  return {
    type: WorkflowEventType.ChildWorkflowScheduled,
    name,
    seq,
    timestamp: new Date(0).toISOString(),
    input: undefined,
  };
}

export function scheduledSleep(untilTime: string, seq: number): SleepScheduled {
  return {
    type: WorkflowEventType.SleepScheduled,
    untilTime,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function completedSleep(seq: number): SleepCompleted {
  return {
    type: WorkflowEventType.SleepCompleted,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function timedOutWaitForEvent(
  eventId: string,
  seq: number
): WaitForEventTimedOut {
  return {
    type: WorkflowEventType.WaitForEventTimedOut,
    timestamp: new Date().toISOString(),
    seq,
    eventId,
  };
}

export function startedWaitForEvent(
  eventId: string,
  seq: number,
  timeoutSeconds?: number
): WaitForEventStarted {
  return {
    type: WorkflowEventType.WaitForEventStarted,
    eventId,
    timestamp: new Date().toISOString(),
    seq,
    timeoutSeconds,
  };
}

export function externalEvent(eventId: string, payload?: any): ExternalEvent {
  return {
    type: WorkflowEventType.ExternalEvent,
    id: ulid(),
    eventId,
    payload,
    timestamp: new Date().toISOString(),
  };
}
