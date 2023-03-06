import { EventualError, HeartbeatTimeout, Timeout } from "@eventual/core";
import {
  assertNever,
  EventualCall,
  isActivityCall,
  isActivityFailed,
  isActivityHeartbeatTimedOut,
  isActivityScheduled,
  isActivitySucceeded,
  isAwaitTimerCall,
  isChildWorkflowFailed,
  isChildWorkflowScheduled,
  isChildWorkflowSucceeded,
  isConditionCall,
  isEventsPublished,
  isExpectSignalCall,
  isPublishEventsCall,
  isRegisterSignalHandlerCall,
  isSendSignalCall,
  isSignalReceived,
  isSignalSent,
  isTimerCompleted,
  isTimerScheduled,
  isWorkflowCall,
  Result,
  ScheduledEvent,
} from "@eventual/core/internal";
import { CommandType } from "./workflow-command.js";
import { Eventual } from "./workflow-executor.js";

export function createEventualFromCall(
  call: EventualCall
): Omit<Eventual<any>, "seq"> {
  if (isActivityCall(call)) {
    return {
      applyEvent: (event) => {
        if (isActivitySucceeded(event)) {
          return Result.resolved(event.result);
        } else if (isActivityFailed(event)) {
          return Result.failed(new EventualError(event.error, event.message));
        } else if (isActivityHeartbeatTimedOut(event)) {
          return Result.failed(
            new HeartbeatTimeout("Activity Heartbeat TimedOut")
          );
        }
        return undefined;
      },
      dependencies: call.timeout
        ? {
            promise: call.timeout,
            handler: () => Result.failed(new Timeout("Activity Timed Out")),
          }
        : undefined,
      generateCommands(seq) {
        return {
          kind: CommandType.StartActivity,
          seq,
          input: call.input,
          name: call.name,
          heartbeat: call.heartbeat,
        };
      },
    };
  } else if (isWorkflowCall(call)) {
    return {
      applyEvent: (event) => {
        if (isChildWorkflowSucceeded(event)) {
          return Result.resolved(event.result);
        } else if (isChildWorkflowFailed(event)) {
          return Result.failed(new EventualError(event.error, event.message));
        }
        return undefined;
      },
      dependencies: call.timeout
        ? {
            promise: call.timeout,
            handler: () => Result.failed("Activity Timed Out"),
          }
        : undefined,
      generateCommands(seq) {
        return {
          kind: CommandType.StartWorkflow,
          seq,
          name: call.name,
          input: call.input,
          opts: call.opts,
        };
      },
    };
  } else if (isAwaitTimerCall(call)) {
    return {
      applyEvent: (event) => {
        if (isTimerCompleted(event)) {
          return Result.resolved(undefined);
        }
        return undefined;
      },
      generateCommands(seq) {
        return {
          kind: CommandType.StartTimer,
          seq,
          schedule: call.schedule,
        };
      },
    };
  } else if (isSendSignalCall(call)) {
    return {
      generateCommands(seq) {
        return {
          kind: CommandType.SendSignal,
          seq,
          signalId: call.signalId,
          target: call.target,
          payload: call.payload,
        };
      },
      result: Result.resolved(undefined),
    };
  } else if (isExpectSignalCall(call)) {
    return {
      signals: call.signalId,
      applyEvent: (event) => {
        if (isSignalReceived(event)) {
          return Result.resolved(event.payload);
        }
        return undefined;
      },
      dependencies: call.timeout
        ? {
            promise: call.timeout,
            handler: () =>
              Result.failed(new Timeout("Expect Signal Timed Out")),
          }
        : undefined,
    };
  } else if (isPublishEventsCall(call)) {
    return {
      generateCommands(seq) {
        return { kind: CommandType.PublishEvents, seq, events: call.events };
      },
      result: Result.resolved(undefined),
    };
  } else if (isConditionCall(call)) {
    // if the condition resolves immediately, just return a completed eventual
    const result = call.predicate();
    if (result) {
      return {
        result: Result.resolved(result),
      };
    } else {
      // otherwise check the state after every event is applied.
      return {
        afterEveryEvent: () => {
          const result = call.predicate();
          return result ? Result.resolved(result) : undefined;
        },
        dependencies: call.timeout
          ? {
              promise: call.timeout,
              handler: () => Result.resolved(false),
            }
          : undefined,
      };
    }
  } else if (isRegisterSignalHandlerCall(call)) {
    return {
      signals: call.signalId,
      applyEvent: (event) => {
        if (isSignalReceived(event)) {
          call.handler(event.payload);
        }
        return undefined;
      },
    };
  }
  return assertNever(call);
}

export function isCorresponding(
  event: ScheduledEvent,
  seq: number,
  call: EventualCall
) {
  if (event.seq !== seq) {
    return false;
  } else if (isActivityScheduled(event)) {
    return isActivityCall(call) && call.name === event.name;
  } else if (isChildWorkflowScheduled(event)) {
    return isWorkflowCall(call) && call.name === event.name;
  } else if (isTimerScheduled(event)) {
    return isAwaitTimerCall(call);
  } else if (isSignalSent(event)) {
    return isSendSignalCall(call) && event.signalId === call.signalId;
  } else if (isEventsPublished(event)) {
    return isPublishEventsCall(call);
  }
  return assertNever(event);
}
