import {
  WorkflowEventType,
  isEntityOperationOfType,
  type EntityCall,
  type EntityRequestFailed,
  type EntityRequestSucceeded,
} from "@eventual/core/internal";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { EntityCallExecutor } from "../../call-executors/entity-call-executor.js";
import { normalizeError } from "../../result.js";
import { EntityStore } from "../../stores/entity-store.js";
import { createEvent } from "../events.js";
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
