import {
  SearchCall,
  SearchRequestFailed,
  SearchRequestSucceeded,
  WorkflowEventType,
} from "@eventual/core/internal";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { OpenSearchClient } from "../../clients/open-search-client.js";
import { normalizeError } from "../../result.js";
import { createEvent } from "../events.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adapator.js";

export function createSearchWorkflowQueueExecutor(
  openSearchClient: OpenSearchClient,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    openSearchClient,
    queueClient,
    async (call: SearchCall, result, { executionTime, seq }) => {
      return createEvent<SearchRequestSucceeded>(
        {
          type: WorkflowEventType.SearchRequestSucceeded,
          operation: call.operation,
          body: result.body,
          seq,
        },
        executionTime
      );
    },
    (call, err, { executionTime, seq }) => {
      return createEvent<SearchRequestFailed>(
        {
          type: WorkflowEventType.SearchRequestFailed,
          operation: call.operation,
          seq,
          ...normalizeError(err),
        },
        executionTime
      );
    }
  );
}
