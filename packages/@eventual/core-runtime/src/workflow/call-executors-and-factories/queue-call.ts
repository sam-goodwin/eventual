import { EventualError } from "@eventual/core";
import {
  QueueCall,
  QueueRequestFailed,
  QueueRequestSucceeded,
  WorkflowCallHistoryType,
  WorkflowEventType,
} from "@eventual/core/internal";
import { Result, normalizeError } from "../../result.js";
import { EventualFactory } from "../call-eventual-factory.js";
import { EventualDefinition, Trigger } from "../eventual-definition.js";
import { QueueClient } from "../../clients/queue-client.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adaptor.js";
import { QueueCallExecutor } from "../../call-executors/queue-call-executor.js";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { createEvent } from "../events.js";

export function createQueueCallWorkflowCallExecutor(
  queueClient: QueueClient,
  executionQueueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    new QueueCallExecutor(queueClient),
    executionQueueClient,
    (call: QueueCall, result, { seq, executionTime }) => {
      return createEvent<QueueRequestSucceeded>(
        {
          type: WorkflowEventType.QueueRequestSucceeded,
          operation: call.operation,
          result: result as any,
          seq,
          name: call.queueName,
        },
        executionTime
      );
    },
    (call: QueueCall, err, { executionTime, seq }) => {
      return createEvent<QueueRequestFailed>(
        {
          type: WorkflowEventType.QueueRequestFailed,
          operation: call.operation,
          seq,
          ...normalizeError(err),
        },
        executionTime
      );
    }
  );
}

export class QueueCallEventualFactory implements EventualFactory<QueueCall> {
  public initializeEventual(call: QueueCall): EventualDefinition<void> {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.QueueRequestSucceeded,
          (event) => Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(WorkflowEventType.QueueRequestFailed, (event) =>
          Result.failed(new EventualError(event.error, event.message))
        ),
      ],
      createCallEvent: (seq) => ({
        type: WorkflowCallHistoryType.QueueRequest,
        seq,
        operation: {
          operation: call.operation,
          params: call.params,
          queueName: call.queueName,
        },
      }),
    };
  }
}
