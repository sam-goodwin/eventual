import { EventualError } from "@eventual/core";
import {
  Result,
  WorkflowCallHistoryType,
  WorkflowEventType,
  type SearchCall,
  type SearchRequestFailed,
  type SearchRequestSucceeded,
} from "@eventual/core/internal";
import { SearchCallExecutor } from "../../call-executors/search-call-client-executor.js";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import type { OpenSearchClient } from "../../clients/open-search-client.js";
import { normalizeError } from "../../result.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import { createEvent } from "../events.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";
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

export class SearchCallEventualFactory implements EventualFactory<SearchCall> {
  public createEventualDefinition(call: SearchCall): EventualDefinition<any> {
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
      createCallEvent: (seq) => {
        return {
          type: WorkflowCallHistoryType.SearchRequest,
          operation: call.operation,
          request: call.request,
          seq,
        };
      },
    };
  }
}
