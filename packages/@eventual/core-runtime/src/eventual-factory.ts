import {
  EventualError,
  GetBucketObjectResponse,
  HeartbeatTimeout,
  Timeout,
} from "@eventual/core";
import {
  assertNever,
  EventualCall,
  isAwaitTimerCall,
  isBucketCall,
  isBucketRequest,
  isBucketRequestSucceededOperationType,
  isChildWorkflowCall,
  isChildWorkflowScheduled,
  isConditionCall,
  isEmitEventsCall,
  isEntityCall,
  isEntityRequest,
  isEventsEmitted,
  isExpectSignalCall,
  isInvokeTransactionCall,
  isRegisterSignalHandlerCall,
  isSearchCall,
  isSendSignalCall,
  isSignalSent,
  isTaskCall,
  isTaskScheduled,
  isTimerScheduled,
  isTransactionRequest,
  Result,
  WorkflowEventType,
} from "@eventual/core/internal";
import { Readable } from "stream";
import { EventualDefinition, Trigger } from "./workflow-executor.js";

export function createEventualFromCall(
  call: EventualCall
): EventualDefinition<any> {
  if (isTaskCall(call)) {
    return {
      triggers: [
        Trigger.onWorkflowEvent(WorkflowEventType.TaskSucceeded, (event) =>
          Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(WorkflowEventType.TaskFailed, (event) =>
          Result.failed(new EventualError(event.error, event.message))
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.TaskHeartbeatTimedOut,
          Result.failed(new HeartbeatTimeout("Task Heartbeat TimedOut"))
        ),
        call.timeout
          ? Trigger.onPromiseResolution(
              call.timeout,
              Result.failed(new Timeout("Task Timed Out"))
            )
          : undefined,
      ],
      isCorresponding(event) {
        return isTaskScheduled(event) && call.name === event.name;
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
  } else if (isEmitEventsCall(call)) {
    return {
      isCorresponding: isEventsEmitted,
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
  } else if (isEntityCall(call)) {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.EntityRequestSucceeded,
          (event) => Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.EntityRequestFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
      ],
      isCorresponding(event) {
        return (
          isEntityRequest(event) &&
          call.operation === event.operation.operation &&
          "name" in call === "name" in event.operation &&
          (!("name" in call && "name" in event.operation) ||
            call.name === event.operation.name)
        );
      },
    };
  } else if (isInvokeTransactionCall(call)) {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.TransactionRequestSucceeded,
          (event) => Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.TransactionRequestFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
      ],
      isCorresponding(event) {
        return isTransactionRequest(event);
      },
    };
  } else if (isBucketCall(call)) {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.BucketRequestSucceeded,
          (event) => {
            // deserialize the body to a readable stream
            if (isBucketRequestSucceededOperationType("get", event)) {
              if (event.result === undefined) {
                return Result.resolved(undefined);
              }

              const buffer = Buffer.from(
                event.result.body,
                event.result.base64Encoded ? "base64" : "utf-8"
              );

              return Result.resolved({
                contentLength: event.result.contentLength,
                etag: event.result.etag,
                body: Readable.from(buffer),
                async getBodyString(encoding) {
                  return buffer.toString(encoding);
                },
              } satisfies GetBucketObjectResponse);
            } else {
              return Result.resolved(event.result);
            }
          }
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.BucketRequestFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
      ],
      isCorresponding(event) {
        return (
          isBucketRequest(event) && event.operation.operation === call.operation
        );
      },
    };
  } else if (isSearchCall(call)) {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.SearchRequestSucceeded,
          (event) => Result.resolved(event.body)
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.SearchRequestFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
      ],
    };
  }
  return assertNever(call);
}
