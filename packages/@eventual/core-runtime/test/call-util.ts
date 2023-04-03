import { EventEnvelope, Schedule } from "@eventual/core";
import {
  ActivityCall,
  ActivityFailed,
  ActivityHeartbeatTimedOut,
  ActivityScheduled,
  ActivitySucceeded,
  AwaitTimerCall,
  ChildWorkflowCall,
  ChildWorkflowFailed,
  ChildWorkflowScheduled,
  ChildWorkflowSucceeded,
  createEventualCall,
  EntityCall,
  EntityOperation,
  EventsPublished,
  EventualCallKind,
  PublishEventsCall,
  SendSignalCall,
  SignalReceived,
  SignalSent,
  SignalTarget,
  TimerCompleted,
  TimerScheduled,
  WorkflowEventType,
  WorkflowTimedOut,
} from "@eventual/core/internal";
import { ulid } from "ulidx";
import type { WorkflowCall } from "../src/workflow-executor.js";

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
    call: createEventualCall(EventualCallKind.AwaitTimerCall, {
      schedule,
    }),
    seq,
  };
}

export function activityCall(
  name: string,
  input: any,
  seq: number
): WorkflowCall<ActivityCall> {
  return {
    call: createEventualCall(EventualCallKind.ActivityCall, {
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
    call: createEventualCall(EventualCallKind.WorkflowCall, {
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
    call: createEventualCall(EventualCallKind.SendSignalCall, {
      target,
      signalId,
    }),
  };
}

export function publishEventCall(
  events: EventEnvelope[],
  seq: number
): WorkflowCall<PublishEventsCall> {
  return {
    seq,
    call: createEventualCall(EventualCallKind.PublishEventsCall, {
      events,
    }),
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

export function entityRequestCall(
  operation: EntityOperation,
  seq: number
): WorkflowCall<EntityCall> {
  return {
    seq,
    call: createEventualCall(EventualCallKind.EntityCall, operation),
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
