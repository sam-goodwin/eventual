import { EventEnvelope, Schedule } from "@eventual/core";
import {
  AwaitTimerCall,
  CallEvent,
  ChildWorkflowCall,
  ChildWorkflowFailed,
  ChildWorkflowScheduled,
  ChildWorkflowSucceeded,
  EmitEventsCall,
  EntityCall,
  EventsEmitted,
  CallKind,
  SendSignalCall,
  SignalReceived,
  SignalSent,
  SignalTarget,
  SignalTargetType,
  TaskCall,
  TaskFailed,
  TaskHeartbeatTimedOut,
  TaskScheduled,
  TaskSucceeded,
  TimerCompleted,
  TimerScheduled,
  WorkflowCallHistoryEvent,
  WorkflowCallHistoryType,
  WorkflowEventType,
  WorkflowTimedOut,
  createCall,
} from "@eventual/core/internal";
import { ulid } from "ulidx";
import type { WorkflowCall } from "../src/workflow/workflow-executor.js";

export function awaitTimerCall(
  schedule: Schedule,
  seq: number
): WorkflowCall<AwaitTimerCall>;
export function awaitTimerCall(seq: number): WorkflowCall<AwaitTimerCall>;
export function awaitTimerCall(
  ...args: [schedule: Schedule, seq: number] | [seq: number]
): WorkflowCall<AwaitTimerCall> {
  const [schedule, seq] =
    args.length === 1 ? [Schedule.time("then"), args[0]] : args;
  return {
    call: createCall(CallKind.AwaitTimerCall, {
      schedule,
    }),
    seq,
  };
}

export function taskCall(
  name: string,
  input: any,
  seq: number
): WorkflowCall<TaskCall> {
  return {
    call: createCall(CallKind.TaskCall, {
      name,
      input,
    }),
    seq,
  };
}

export function childWorkflowCall(
  name: string,
  input: any,
  seq: number
): WorkflowCall<ChildWorkflowCall> {
  return {
    seq,
    call: createCall(CallKind.ChildWorkflowCall, {
      name,
      input,
    }),
  };
}

export function sendSignalCall(
  target: SignalTarget,
  signalId: string,
  seq: number
): WorkflowCall<SendSignalCall> {
  return {
    seq,
    call: createCall(CallKind.SendSignalCall, {
      target,
      signalId,
    }),
  };
}

export function emitEventCall(
  events: EventEnvelope[],
  seq: number
): WorkflowCall<EmitEventsCall> {
  return {
    seq,
    call: createCall(CallKind.EmitEventsCall, {
      events,
    }),
  };
}

export function taskSucceeded(result: any, seq: number): TaskSucceeded {
  return {
    type: WorkflowEventType.TaskSucceeded,
    result,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

export function entityRequestCall(
  call: EntityCall,
  seq: number
): WorkflowCall<EntityCall> {
  return {
    seq,
    call: createCall(CallKind.EntityCall, call),
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

export function taskFailed(error: any, seq: number): TaskFailed {
  return {
    type: WorkflowEventType.TaskFailed,
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

export function taskScheduled(name: string, seq: number) {
  return callEvent<TaskScheduled>({
    type: WorkflowCallHistoryType.TaskScheduled,
    name,
    seq,
  });
}

export function taskHeartbeatTimedOut(
  seq: number,
  /** Relative seconds from 0 */
  seconds: number
): TaskHeartbeatTimedOut {
  return {
    type: WorkflowEventType.TaskHeartbeatTimedOut,
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

export function callEvent<E extends WorkflowCallHistoryEvent>(
  event: E
): CallEvent<E> {
  return {
    type: WorkflowEventType.CallEvent,
    event,
    timestamp: new Date(0).toISOString(),
  };
}

export function workflowScheduled(name: string, seq: number, input?: any) {
  return callEvent<ChildWorkflowScheduled>({
    type: WorkflowCallHistoryType.ChildWorkflowScheduled,
    name,
    seq,
    input,
  });
}

export function timerScheduled(
  seq: number,
  schedule: Schedule = Schedule.duration(10, "seconds")
) {
  return callEvent<TimerScheduled>({
    type: WorkflowCallHistoryType.TimerScheduled,
    schedule,
    seq,
  });
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
) {
  return callEvent<SignalSent>({
    type: WorkflowCallHistoryType.SignalSent,
    target: { type: SignalTargetType.Execution, executionId },
    seq,
    signalId,
    payload,
  });
}

export function signalSentChildTarget(
  workflowName: string,
  childSeq: number,
  signalId: string,
  seq: number,
  payload?: any
) {
  return callEvent<SignalSent>({
    type: WorkflowCallHistoryType.SignalSent,
    target: {
      type: SignalTargetType.ChildExecution,
      seq: childSeq,
      workflowName,
    },
    seq,
    signalId,
    payload,
  });
}

export function eventsEmitted(events: EventEnvelope[], seq: number) {
  return callEvent<EventsEmitted>({
    type: WorkflowCallHistoryType.EventsEmitted,
    seq,
    events,
  });
}
