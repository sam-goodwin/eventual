import { ulid } from "ulidx";
import {
  CommandType,
  ExpectSignalCommand,
  OverrideActivityCommand,
  PublishEventsCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
  SendSignalCommand,
  SleepForCommand,
  SleepUntilCommand,
  StartConditionCommand,
} from "../src/command.js";
import { EventEnvelope } from "../src/event.js";
import {
  ActivityCompleted,
  ActivityFailed,
  ActivityScheduled,
  ActivityTimedOut,
  ChildWorkflowCompleted,
  ChildWorkflowFailed,
  ChildWorkflowScheduled,
  ConditionStarted,
  ConditionTimedOut,
  EventsPublished,
  ExpectSignalStarted,
  ExpectSignalTimedOut,
  SignalReceived,
  SignalSent,
  SleepCompleted,
  SleepScheduled,
  WorkflowEventType,
  WorkflowTimedOut,
  ActivityHeartbeatTimedOut,
  ActivityOverridden,
} from "../src/workflow-events.js";
import { SignalTarget } from "../src/signals.js";
import { Failed, Resolved } from "../src/result.js";
import { ActivityTarget } from "../src/index.js";

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

export function createOverrideActivityCommand(
  outcome: Resolved | Failed,
  target: ActivityTarget,
  seq: number
): OverrideActivityCommand {
  return {
    kind: CommandType.OverrideActivity,
    seq,
    outcome,
    target,
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

export function createExpectSignalCommand(
  signalId: string,
  seq: number,
  timeoutSeconds?: number
): ExpectSignalCommand {
  return {
    kind: CommandType.ExpectSignal,
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

export function createPublishEventCommand(
  events: EventEnvelope[],
  seq: number
): PublishEventsCommand {
  return {
    kind: CommandType.PublishEvents,
    seq,
    events: events,
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
    error,
    message: "message",
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function activityTimedOut(seq: number): ActivityTimedOut {
  return {
    type: WorkflowEventType.ActivityTimedOut,
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

export function activityOverridden(
  executionId: string,
  activitySeq: number,
  seq: number
): ActivityOverridden {
  return {
    type: WorkflowEventType.ActivityOverridden,
    executionId,
    activitySeq,
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

export function timedOutExpectSignal(
  signalId: string,
  seq: number
): ExpectSignalTimedOut {
  return {
    type: WorkflowEventType.ExpectSignalTimedOut,
    timestamp: new Date().toISOString(),
    seq,
    signalId,
  };
}

export function startedExpectSignal(
  signalId: string,
  seq: number,
  timeoutSeconds?: number
): ExpectSignalStarted {
  return {
    type: WorkflowEventType.ExpectSignalStarted,
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
