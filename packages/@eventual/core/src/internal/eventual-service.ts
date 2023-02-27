import { z } from "zod";
import { eventEnvelopeSchema } from "./event.js";
import { Execution, ExecutionID, ExecutionStatus } from "../execution.js";
import { Command } from "../http/command.js";
import { HistoryStateEvent, WorkflowEvent } from "./workflow-events.js";
import { workflowOptionsSchema } from "./workflow.js";

export enum SortOrder {
  Asc = "ASC",
  Desc = "DESC",
}

export const publishEventsRequestSchema = /* @__PURE__ */ z.object({
  events: z.array(eventEnvelopeSchema),
});

export interface WorkflowReference {
  name: string;
}

export interface ListWorkflowsResponse {
  workflows: WorkflowReference[];
}

export const sendSignalRequestSchema = /* @__PURE__ */ z.object({
  executionId: z.string(),
  signalId: z.string(),
  payload: z.any(),
  id: z.string().optional(),
});

export const startExecutionRequestSchema =
  /* @__PURE__ */ workflowOptionsSchema.extend({
    executionName: z.string().optional(),
    workflow: z.string(),
    input: z.any().optional(),
  });

export interface StartExecutionResponse {
  /**
   * ID of the started workflow execution.
   */
  executionId: ExecutionID;
  /**
   * @returns true when the execution name with the same input
   *          was already started. Use `getExecution` to check the status.
   */
  alreadyRunning: boolean;
}

export const listExecutionsRequestSchema = /* @__PURE__ */ z.object({
  statuses: z.array(z.nativeEnum(ExecutionStatus)).optional(),
  workflowName: z.string().optional(),
  nextToken: z.string().optional(),
  sortDirection: z.nativeEnum(SortOrder).default(SortOrder.Asc).optional(),
  maxResults: z.number().default(100).optional(),
});

export interface ListExecutionsResponse {
  executions: Execution[];
  /**
   * A token returned when there may be more executions to retrieve.
   */
  nextToken?: string;
}

export const listExecutionEventsRequestSchema = /* @__PURE__ */ z.object({
  executionId: z.string(),
  sortDirection: z.nativeEnum(SortOrder).default(SortOrder.Asc).optional(),
  nextToken: z.string().optional(),
  maxResults: z.number().default(100).optional(),
  after: z.string().optional().describe("Start returning after a data"),
});

export interface ListExecutionEventsResponse {
  events: WorkflowEvent[];
  nextToken?: string;
}

export interface ExecutionHistoryResponse {
  events: HistoryStateEvent[];
}

export enum ActivityUpdateType {
  Success = "Success",
  Failure = "Failure",
  Heartbeat = "Heartbeat",
}

export const sendActivitySuccessRequestSchema = /* @__PURE__ */ z.object({
  type: z.literal(ActivityUpdateType.Success),
  activityToken: z.string(),
  result: z.any(),
});

export const sendActivityFailureRequestSchema = /* @__PURE__ */ z.object({
  type: z.literal(ActivityUpdateType.Failure),
  activityToken: z.string(),
  error: z.string(),
  message: z.string().optional(),
});

export const sendActivityHeartbeatRequestSchema = /* @__PURE__ */ z.object({
  type: z.literal(ActivityUpdateType.Heartbeat),
  activityToken: z.string(),
});

export const sendActivityUpdateSchema = /* @__PURE__ */ z.union([
  sendActivitySuccessRequestSchema,
  sendActivityFailureRequestSchema,
  sendActivityHeartbeatRequestSchema,
]);

export type SendActivityUpdate = z.infer<typeof sendActivityUpdateSchema>;

export type SendActivitySuccessRequest<T = any> = Omit<
  z.infer<typeof sendActivitySuccessRequestSchema>,
  "result" | "type"
> & {
  result?: T;
};

export type SendActivityFailureRequest = Omit<
  z.infer<typeof sendActivityFailureRequestSchema>,
  "type"
>;

export type SendActivityHeartbeatRequest = Omit<
  z.infer<typeof sendActivityHeartbeatRequestSchema>,
  "type"
>;

export function isSendActivitySuccessRequest<T = any>(
  request: SendActivityUpdate
): request is SendActivitySuccessRequest<T> & {
  type: ActivityUpdateType.Success;
} {
  return request.type === ActivityUpdateType.Success;
}

export function isSendActivityFailureRequest(
  request: SendActivityUpdate
): request is SendActivityFailureRequest & {
  type: ActivityUpdateType.Failure;
} {
  return request.type === ActivityUpdateType.Failure;
}

export function isSendActivityHeartbeatRequest(
  request: SendActivityUpdate
): request is SendActivityHeartbeatRequest & {
  type: ActivityUpdateType.Heartbeat;
} {
  return request.type === ActivityUpdateType.Heartbeat;
}

export interface SendActivityHeartbeatResponse {
  /**
   * True when the activity has been cancelled.
   *
   * This is the only way for a long running activity to know it was cancelled.
   */
  cancelled: boolean;
}

export type EventualService = {
  listWorkflows: Command<"listWorkflows", void, ListWorkflowsResponse>;
  publishEvents: Command<
    "publishEvents",
    z.infer<typeof publishEventsRequestSchema>,
    void
  >;
  getExecution: Command<"getExecution", string, Execution<any> | undefined>;
  startExecution: Command<
    "startExecution",
    z.infer<typeof startExecutionRequestSchema>,
    StartExecutionResponse
  >;
  listExecutions: Command<
    "listExecutions",
    z.infer<typeof listExecutionsRequestSchema>,
    ListExecutionsResponse
  >;
  sendSignal: Command<
    "sendSignal",
    z.infer<typeof sendSignalRequestSchema>,
    void
  >;
  getExecutionHistory: Command<
    "getExecutionHistory",
    z.infer<typeof listExecutionEventsRequestSchema>,
    ListExecutionEventsResponse
  >;
  getExecutionWorkflowHistory: Command<
    "getExecutionWorkflowHistory",
    string,
    ExecutionHistoryResponse
  >;
  updateActivity: Command<
    "updateActivity",
    z.infer<typeof sendActivityUpdateSchema>,
    void | SendActivityHeartbeatResponse
  >;
};
