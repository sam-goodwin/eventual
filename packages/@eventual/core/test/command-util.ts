import {
  CommandType,
  SleepForCommand,
  SleepUntilCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
} from "../src/command.js";
import {
  ActivityCompleted,
  ActivityFailed,
  ActivityScheduled,
  ChildWorkflowCompleted,
  ChildWorkflowFailed,
  ChildWorkflowScheduled,
  SleepCompleted,
  SleepScheduled,
  WorkflowEventType,
} from "../src/events.js";

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