import { EventualError, HeartbeatTimeout, Timeout } from "@eventual/core";
import {
  assertNever,
  EventualCall,
  isActivityCall,
  isActivityScheduled,
  isAwaitTimerCall,
  isChildWorkflowScheduled,
  isConditionCall,
  isEventsPublished,
  isExpectSignalCall,
  isPublishEventsCall,
  isRegisterSignalHandlerCall,
  isSendSignalCall,
  isSignalSent,
  isTimerScheduled,
  isWorkflowCall,
  Result,
  ScheduledEvent,
  WorkflowEventType,
} from "@eventual/core/internal";
import { CommandType } from "./workflow-command.js";
import { EventualDefinition, Trigger } from "./workflow-executor.js";

export function createEventualFromCall(
  call: EventualCall
): EventualDefinition<any> {
  if (isActivityCall(call)) {
    return {
      triggers: [
        Trigger.workflowEvent(WorkflowEventType.ActivitySucceeded, (event) =>
          Result.resolved(event.result)
        ),
        Trigger.workflowEvent(WorkflowEventType.ActivityFailed, (event) =>
          Result.failed(new EventualError(event.error, event.message))
        ),
        Trigger.workflowEvent(
          WorkflowEventType.ActivityHeartbeatTimedOut,
          Result.failed(new HeartbeatTimeout("Activity Heartbeat TimedOut"))
        ),
        call.timeout
          ? Trigger.promise(
              call.timeout,
              Result.failed(new Timeout("Activity Timed Out"))
            )
          : undefined,
      ],
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
      triggers: [
        Trigger.workflowEvent(
          WorkflowEventType.ChildWorkflowSucceeded,
          (event) => Result.resolved(event.result)
        ),
        Trigger.workflowEvent(WorkflowEventType.ChildWorkflowFailed, (event) =>
          Result.failed(new EventualError(event.error, event.message))
        ),
        call.timeout
          ? Trigger.promise(
              call.timeout,
              Result.failed("Child Workflow Timed Out")
            )
          : undefined,
      ],
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
      triggers: Trigger.workflowEvent(
        WorkflowEventType.TimerCompleted,
        Result.resolved(undefined)
      ),
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
      triggers: [
        Trigger.signal(call.signalId, (event) =>
          Result.resolved(event.payload)
        ),
        call.timeout
          ? Trigger.promise(
              call.timeout,
              Result.failed(new Timeout("Expect Signal Timed Out"))
            )
          : undefined,
      ],
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
        triggers: [
          Trigger.afterEveryEvent(() => {
            const result = call.predicate();
            return result ? Result.resolved(result) : undefined;
          }),
          call.timeout
            ? Trigger.promise(call.timeout, Result.resolved(false))
            : undefined,
        ],
      };
    }
  } else if (isRegisterSignalHandlerCall(call)) {
    return {
      triggers: Trigger.signal(call.signalId, (event) => {
        call.handler(event.payload);
      }),
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
