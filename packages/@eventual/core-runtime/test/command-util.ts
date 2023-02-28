import { EventEnvelope, Schedule } from "@eventual/core";
import {
  ActivityFailed,
  ActivityHeartbeatTimedOut,
  ActivityScheduled,
  ActivitySucceeded,
  ChildWorkflowFailed,
  ChildWorkflowScheduled,
  ChildWorkflowSucceeded,
  CommandType,
  EventsPublished,
  PublishEventsCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
  SendSignalCommand,
  SignalReceived,
  SignalSent,
  SignalTarget,
  StartTimerCommand,
  TimerCompleted,
  TimerScheduled,
  WorkflowEventType,
  WorkflowTimedOut,
} from "@eventual/core/internal";
import { ulid } from "ulidx";

export function createStartTimerCommand(
  schedule: Schedule,
  seq: number
): StartTimerCommand;
export function createStartTimerCommand(seq: number): StartTimerCommand;
export function createStartTimerCommand(
  ...args: [schedule: Schedule, seq: number] | [seq: number]
): StartTimerCommand {
  const [schedule, seq] =
    args.length === 1 ? [Schedule.time("then"), args[0]] : args;
  return {
    kind: CommandType.StartTimer,
    schedule,
    seq,
  };
}

export function createScheduledActivityCommand(
  name: string,
  input: any,
  seq: number
): ScheduleActivityCommand {
  return {
    kind: CommandType.StartActivity,
    seq,
    name,
    input,
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

export function createPublishEventCommand(
  events: EventEnvelope[],
  seq: number
): PublishEventsCommand {
  return {
    kind: CommandType.PublishEvents,
    seq,
    events,
  };
}

export function activitySucceeded(result: any, seq: number): ActivitySucceeded {
  return {
    type: WorkflowEventType.ActivitySucceeded,
    result,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function workflowSucceeded(
  result: any,
  seq: number
): ChildWorkflowSucceeded {
  return {
    type: WorkflowEventType.ChildWorkflowSucceeded,
    result,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function activityFailed(error: any, seq: number): ActivityFailed {
  return {
    type: WorkflowEventType.ActivityFailed,
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

export function activityHeartbeatTimedOut(
  seq: number,
  /** Relative seconds from 0 */
  seconds: number
): ActivityHeartbeatTimedOut {
  return {
    type: WorkflowEventType.ActivityHeartbeatTimedOut,
    seq,
    timestamp: new Date(seconds * 1000).toISOString(),
  };
}

export function workflowTimedOut(): WorkflowTimedOut {
  return {
    type: WorkflowEventType.WorkflowTimedOut,
    id: ulid(),
    timestamp: new Date().toISOString(),
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

export function timerScheduled(seq: number): TimerScheduled {
  return {
    type: WorkflowEventType.TimerScheduled,
    untilTime: "",
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function timerCompleted(seq: number): TimerCompleted {
  return {
    type: WorkflowEventType.TimerCompleted,
    seq,
    timestamp: new Date(0).toISOString(),
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

export function eventsPublished(
  events: EventEnvelope[],
  seq: number
): EventsPublished {
  return {
    type: WorkflowEventType.EventsPublished,
    seq,
    timestamp: new Date().toISOString(),
    events,
  };
}
