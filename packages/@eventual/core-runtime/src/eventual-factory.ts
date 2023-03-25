import { EventualError, HeartbeatTimeout, Timeout } from "@eventual/core";
import {
  assertNever,
  EventualCall,
  isActivityCall,
  isActivityScheduled,
  isAwaitTimerCall,
  isChildWorkflowCall,
  isChildWorkflowScheduled,
  isConditionCall,
  isDictionaryCall,
  isDictionaryRequest,
  isEventsPublished,
  isExpectSignalCall,
  isPublishEventsCall,
  isRegisterSignalHandlerCall,
  isSendSignalCall,
  isSignalSent,
  isTimerScheduled,
  Result,
  WorkflowEventType,
} from "@eventual/core/internal";
import { EventualDefinition, Trigger } from "./workflow-executor.js";

export function createEventualFromCall(
  call: EventualCall
): EventualDefinition<any> {
  if (isActivityCall(call)) {
    return {
      triggers: [
        Trigger.onWorkflowEvent(WorkflowEventType.ActivitySucceeded, (event) =>
          Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(WorkflowEventType.ActivityFailed, (event) =>
          Result.failed(new EventualError(event.error, event.message))
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.ActivityHeartbeatTimedOut,
          Result.failed(new HeartbeatTimeout("Activity Heartbeat TimedOut"))
        ),
        call.timeout
          ? Trigger.onPromiseResolution(
              call.timeout,
              Result.failed(new Timeout("Activity Timed Out"))
            )
          : undefined,
      ],
      isCorresponding(event) {
        return isActivityScheduled(event) && call.name === event.name;
      },
    };
  } else if (isChildWorkflowCall(call)) {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.ChildWorkflowSucceeded,
          (event) => Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.ChildWorkflowFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
        call.timeout
          ? Trigger.onPromiseResolution(
              call.timeout,
              Result.failed("Child Workflow Timed Out")
            )
          : undefined,
      ],
      isCorresponding(event) {
        return isChildWorkflowScheduled(event) && event.name === call.name;
      },
    };
  } else if (isAwaitTimerCall(call)) {
    return {
      triggers: Trigger.onWorkflowEvent(
        WorkflowEventType.TimerCompleted,
        Result.resolved(undefined)
      ),
      isCorresponding: isTimerScheduled,
    };
  } else if (isSendSignalCall(call)) {
    return {
      isCorresponding(event) {
        return isSignalSent(event) && event.signalId === call.signalId;
      },
      result: Result.resolved(undefined),
    };
  } else if (isExpectSignalCall(call)) {
    return {
      triggers: [
        Trigger.onSignal(call.signalId, (event) =>
          Result.resolved(event.payload)
        ),
        call.timeout
          ? Trigger.onPromiseResolution(
              call.timeout,
              Result.failed(new Timeout("Expect Signal Timed Out"))
            )
          : undefined,
      ],
    };
  } else if (isPublishEventsCall(call)) {
    return {
      isCorresponding: isEventsPublished,
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
        triggers: [
          Trigger.afterEveryEvent(() => {
            const result = call.predicate();
            return result ? Result.resolved(result) : undefined;
          }),
          call.timeout
            ? Trigger.onPromiseResolution(call.timeout, Result.resolved(false))
            : undefined,
        ],
      };
    }
  } else if (isRegisterSignalHandlerCall(call)) {
    return {
      triggers: Trigger.onSignal(call.signalId, (event) => {
        call.handler(event.payload);
      }),
    };
  } else if (isDictionaryCall(call)) {
    return {
      triggers: Trigger.onWorkflowEvent(
        WorkflowEventType.DictionaryRequestSucceeded,
        (event) => Result.resolved(event.result)
      ),
      isCorresponding(event) {
        return isDictionaryRequest(event) && call.operation === event.operation;
      },
    };
  }
  return assertNever(call);
}
