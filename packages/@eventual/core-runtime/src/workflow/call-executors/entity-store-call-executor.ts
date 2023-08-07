import {
  EntityCall,
  EntityRequestSucceeded,
  WorkflowEventType,
  isEntityOperationOfType,
  EntityRequestFailed,
} from "@eventual/core/internal";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { normalizeError } from "../../result.js";
import { EntityStore } from "../../stores/entity-store.js";
import { createEvent } from "../events.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adapator.js";

export function createEntityWorkflowQueueExecutor(
  entityStore: EntityStore,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    entityStore,
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
