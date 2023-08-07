import {
  EventualError,
  HeartbeatTimeout,
  Timeout,
  type GetBucketObjectResponse,
} from "@eventual/core";
import {
  Result,
  WorkflowCallHistoryType,
  WorkflowEventType,
  assertNever,
  isAwaitTimerCall,
  isBucketCall,
  isBucketCallType,
  isBucketRequestSucceededOperationType,
  isChildWorkflowCall,
  isConditionCall,
  isEmitEventsCall,
  isEntityCall,
  isExpectSignalCall,
  isGetExecutionCall,
  isInvokeTransactionCall,
  isRegisterSignalHandlerCall,
  isSearchCall,
  isSendSignalCall,
  isStartWorkflowCall,
  isTaskCall,
  isTaskRequestCall,
  type BucketMethod,
  type BucketOperation,
  type EventualCall,
} from "@eventual/core/internal";
import { Readable } from "stream";
import { EventualDefinition, Trigger } from "./workflow/workflow-executor.js";

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
      createCallEvent(seq) {
        return {
          name: call.name,
          seq,
          type: WorkflowCallHistoryType.TaskScheduled,
        };
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
      createCallEvent(seq) {
        return {
          type: WorkflowCallHistoryType.ChildWorkflowScheduled,
          name: call.name,
          seq,
          input: call.input,
        };
      },
    };
  } else if (isAwaitTimerCall(call)) {
    return {
      triggers: Trigger.onWorkflowEvent(
        WorkflowEventType.TimerCompleted,
        Result.resolved(undefined)
      ),
      createCallEvent: (seq) => ({
        type: WorkflowCallHistoryType.TimerScheduled,
        seq,
        schedule: call.schedule,
      }),
    };
  } else if (isSendSignalCall(call)) {
    return {
      createCallEvent(seq) {
        return {
          type: WorkflowCallHistoryType.SignalSent,
          target: call.target,
          signalId: call.signalId,
          seq,
          payload: call.payload,
        };
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
      createCallEvent: (seq) => ({
        type: WorkflowCallHistoryType.EventsEmitted,
        events: call.events,
        seq,
      }),
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
      createCallEvent(seq) {
        return {
          type: WorkflowCallHistoryType.EntityRequest,
          operation: call.operation,
          seq,
        };
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
      createCallEvent(seq) {
        return {
          type: WorkflowCallHistoryType.TransactionRequest,
          input: call.input,
          seq,
          transactionName: call.transactionName,
        };
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
      createCallEvent(seq) {
        if (isBucketCallType("put", call)) {
          // data isn't saved or compared against for bucket puts
          const [key] = call.operation.params;
          return {
            type: WorkflowCallHistoryType.BucketRequest,
            operation: {
              operation: "put",
              bucketName: call.operation.bucketName,
              key,
            },
            seq,
          };
        } else {
          return {
            type: WorkflowCallHistoryType.BucketRequest,
            operation: call.operation as BucketOperation<
              Exclude<BucketMethod, "put">
            >,
            seq,
          };
        }
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
  } else if (isTaskRequestCall(call)) {
    // TODO: implement.
    return {
      result: Result.failed(
        new Error(
          "Task Heartbeat, Success, and Fail requests are not supported in a workflow currently."
        )
      ),
    };
  } else if (isStartWorkflowCall(call)) {
    // TODO: implement.
    return {
      result: Result.failed(
        new Error("Start Workflow is not supported in a workflow currently.")
      ),
    };
  } else if (isGetExecutionCall(call)) {
    // TODO: implement.
    return {
      result: Result.failed(
        new Error(
          "Task Heartbeat, Success, and Fail requests are not supported in a workflow currently."
        )
      ),
    };
  }
  return assertNever(call);
}
