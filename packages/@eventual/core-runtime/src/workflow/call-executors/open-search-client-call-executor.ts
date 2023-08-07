import {
  WorkflowEventType,
  type SearchCall,
  type SearchRequestFailed,
  type SearchRequestSucceeded,
} from "@eventual/core/internal";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import type { OpenSearchClient } from "../../clients/open-search-client.js";
import { SearchCallExecutor } from "../../call-executors/search-call-client-executor.js";
import { normalizeError } from "../../result.js";
import { createEvent } from "../events.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adaptor.js";

export function createSearchWorkflowQueueExecutor(
  openSearchClient: OpenSearchClient,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    new SearchCallExecutor(openSearchClient),
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
