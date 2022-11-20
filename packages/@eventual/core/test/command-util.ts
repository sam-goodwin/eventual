import {
  CommandType,
  SleepForCommand,
  SleepUntilCommand,
  StartActivityCommand,
} from "../src/command.js";
import {
  ActivityCompleted,
  ActivityFailed,
  ActivityScheduled,
  SleepCompleted,
  SleepScheduled,
  WorkflowEventType,
} from "../src/events.js";

export function createStartActivityCommand(
  name: string,
  args: any[],
  seq: number
): StartActivityCommand {
  return {
    type: CommandType.StartActivity,
    args,
    name,
    seq,
  };
}

export function createSleepUntilCommand(
  untilTime: string,
  seq: number
): SleepUntilCommand {
  return {
    type: CommandType.SleepUntil,
    untilTime,
    seq,
  };
}

export function createSleepForCommand(
  durationSeconds: number,
  seq: number
): SleepForCommand {
  return {
    type: CommandType.SleepFor,
    durationSeconds: durationSeconds,
    seq,
  };
}

export function completedActivity(result: any, seq: number): ActivityCompleted {
  return {
    type: WorkflowEventType.ActivityCompleted,
    duration: 0,
    result,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function failedActivity(error: any, seq: number): ActivityFailed {
  return {
    type: WorkflowEventType.ActivityFailed,
    duration: 0,
    error,
    message: "message",
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function scheduledActivity(
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
