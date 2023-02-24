import {
  EventualService,
  listExecutionEventsRequestSchema,
} from "@eventual/core/internal";
import { createExecutionHistoryStore } from "../../../create.js";
import { systemCommand } from "../system-command.js";

const executionHistoryStore = createExecutionHistoryStore();

/**
 * Get events for a workflow.
 *
 * Path Parameters:
 * * executionId - Execution to get events for
 *
 * Query Parameters:
 * * sortDirection - Asc | Desc - Direction to sort the result by start time. Default: Asc
 * * maxResult - maximum number of results to return. Default: 100
 * * nextToken - continue a previous request
 * * after - a ISO 8601 timestamp which all events should be after
 */
export const handler = systemCommand<EventualService["getExecutionHistory"]>(
  { inputSchema: listExecutionEventsRequestSchema },
  (request) => {
    return executionHistoryStore.getEvents(request);
  }
);
