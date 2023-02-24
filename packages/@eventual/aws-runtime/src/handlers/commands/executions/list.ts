import {
  EventualService,
  listExecutionsRequestSchema,
} from "@eventual/core/internal";
import { createExecutionStore } from "../../../create.js";
import { systemCommand } from "../system-command.js";

const executionStore = createExecutionStore();

/**
 * Query Parameters:
 * * sortDirection - Asc | Desc - Direction to sort the result by start time. Default: Asc
 * * workflow - workflow name filter
 * * maxResult - maximum number of results to return. Default: 100
 * * nextToken - continue a previous request
 * * statuses - IN_PROGRESS | SUCCEEDED | FAILED - One or more comma delimited statuses to return. Default: all statuses
 */
export const handler = systemCommand<EventualService["listExecutions"]>(
  { inputSchema: listExecutionsRequestSchema },
  async (request) => {
    return executionStore.list(request);
  }
);
