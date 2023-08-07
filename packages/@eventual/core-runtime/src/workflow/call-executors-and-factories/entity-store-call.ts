import { EventualError } from "@eventual/core";
import {
  WorkflowCallHistoryType,
  WorkflowEventType,
  isEntityOperationOfType,
  type EntityCall,
  type EntityRequestFailed,
  type EntityRequestSucceeded,
} from "@eventual/core/internal";
import { EntityCallExecutor } from "../../call-executors/entity-call-executor.js";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { Result, normalizeError } from "../../result.js";
import type { EntityStore } from "../../stores/entity-store.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import { createEvent } from "../events.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adaptor.js";

export function createEntityWorkflowQueueExecutor(
  entityStore: EntityStore,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    new EntityCallExecutor(entityStore),
    queueClient,
    async (call: EntityCall, result, { executionTime, seq }) => {
      return createEvent<EntityRequestSucceeded>(
        {
          type: WorkflowEventType.EntityRequestSucceeded,
          operation: call.operation.operation,
          name: isEntityOperationOfType("transact", call.operation)
            ? undefined
            : call.operation.entityName,
          result,
          seq,
        },
        executionTime
      );
    },
    (call, err, { executionTime, seq }) => {
      return createEvent<EntityRequestFailed>(
        {
          type: WorkflowEventType.EntityRequestFailed,
          seq,
          operation: call.operation.operation,
          name: isEntityOperationOfType("transact", call.operation)
            ? undefined
            : call.operation.entityName,
          ...normalizeError(err),
        },
        executionTime
      );
    }
  );
}

export class EntityCallEventualFactory implements EventualFactory<EntityCall> {
  public initializeEventual(call: EntityCall): EventualDefinition<any> {
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
  }
}
