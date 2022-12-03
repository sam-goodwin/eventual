import {
  CommandType,
  SleepForCommand,
  SleepUntilCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
  WaitForSignalCommand,
  SendSignalCommand,
  StartConditionCommand,
} from "../src/command.js";
import {
  ActivityCompleted,
  ActivityFailed,
  ActivityScheduled,
  ChildWorkflowCompleted,
  ChildWorkflowFailed,
  ChildWorkflowScheduled,
  ConditionStarted,
  ConditionTimedOut,
  SignalReceived,
  SignalSent,
  SleepCompleted,
  SleepScheduled,
  WaitForSignalStarted,
  WaitForSignalTimedOut,
  WorkflowEventType,
} from "../src/events.js";
import { ulid } from "ulidx";
import { SignalTarget } from "../src/signals.js";

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

export function createWaitForSignalCommand(
  signalId: string,
  seq: number,
  timeoutSeconds?: number
): WaitForSignalCommand {
  return {
    kind: CommandType.WaitForSignal,
    signalId,
    seq,
    timeoutSeconds,
  };
}

export function createSendSignalCommand(
  target: SignalTarget,
  signalId: string,
  seq: number
): SendSignalCommand {
  return {
    kind: CommandType.SendSignal,
    seq,
    target,
    signalId,
  };
}

export function createStartConditionCommand(
  seq: number,
  timeoutSeconds?: number
): StartConditionCommand {
  return {
    kind: CommandType.StartCondition,
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

export function timedOutWaitForSignal(
  signalId: string,
  seq: number
): WaitForSignalTimedOut {
  return {
    type: WorkflowEventType.WaitForSignalTimedOut,
    timestamp: new Date().toISOString(),
    seq,
    signalId,
  };
}

export function startedWaitForSignal(
  signalId: string,
  seq: number,
  timeoutSeconds?: number
): WaitForSignalStarted {
  return {
    type: WorkflowEventType.WaitForSignalStarted,
    signalId,
    timestamp: new Date().toISOString(),
    seq,
    timeoutSeconds,
  };
}

export function signalReceived(
  signalId: string,
  payload?: any
): SignalReceived {
  return {
    type: WorkflowEventType.SignalReceived,
    id: ulid(),
    signalId,
    payload,
    timestamp: new Date().toISOString(),
  };
}

export function signalSent(
  executionId: string,
  signalId: string,
  seq: number,
  payload?: any
): SignalSent {
  return {
    type: WorkflowEventType.SignalSent,
    executionId,
    seq,
    signalId,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function conditionStarted(seq: number): ConditionStarted {
  return {
    type: WorkflowEventType.ConditionStarted,
    seq,
    timestamp: new Date().toISOString(),
  };
}

export function conditionTimedOut(seq: number): ConditionTimedOut {
  return {
    type: WorkflowEventType.ConditionTimedOut,
    timestamp: new Date().toISOString(),
    seq,
  };
}
