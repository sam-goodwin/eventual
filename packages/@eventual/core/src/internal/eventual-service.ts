import { z } from "zod";
import { Execution, ExecutionID, ExecutionStatus } from "../execution.js";
import { Command } from "../http/command.js";
import { eventEnvelopeSchema } from "./event.js";
import type { HistoryStateEvent, WorkflowEvent } from "./workflow-events.js";
import { workflowOptionsSchema } from "./workflow.js";

export const EVENTUAL_SYSTEM_COMMAND_NAMESPACE = "_system";

export const sortOrderSchema = z.enum(["ASC", "DESC"]);

export const publishEventsRequestSchema = /* @__PURE__ */ z.object({
  events: z.array(eventEnvelopeSchema),
});

export interface PublishEventsRequest
  extends z.infer<typeof publishEventsRequestSchema> {}

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

export interface SendSignalRequestSchema
  extends z.infer<typeof sendSignalRequestSchema> {}

export const startExecutionRequestSchema =
  /* @__PURE__ */ workflowOptionsSchema.extend({
    executionName: z.string().optional(),
    workflow: z.string(),
    input: z.any().optional(),
  });

export interface StartExecutionRequest
  extends z.infer<typeof startExecutionRequestSchema> {}

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
  sortDirection: sortOrderSchema.default("ASC").optional(),
  maxResults: z.number().default(100).optional(),
});

export interface ListExecutionsRequest
  extends z.infer<typeof listExecutionsRequestSchema> {}

export interface ListExecutionsResponse {
  executions: Execution[];
  /**
   * A token returned when there may be more executions to retrieve.
   */
  nextToken?: string;
}

export const listExecutionEventsRequestSchema = /* @__PURE__ */ z.object({
  executionId: z.string(),
  sortDirection: sortOrderSchema.default("ASC").optional(),
  nextToken: z.string().optional(),
  maxResults: z.number().default(100).optional(),
  after: z.string().optional().describe("Start returning after a data"),
});

export interface ListExecutionEventsRequest
  extends z.infer<typeof listExecutionEventsRequestSchema> {}

export interface ListExecutionEventsResponse {
  events: WorkflowEvent[];
  nextToken?: string;
}

export interface ExecutionHistoryResponse {
  events: HistoryStateEvent[];
}

export const sendActivitySuccessRequestSchema = /* @__PURE__ */ z.object({
  type: z.literal("Success"),
  activityToken: z.string(),
  result: z.any(),
});

export const sendActivityFailureRequestSchema = /* @__PURE__ */ z.object({
  type: z.literal("Failure"),
  activityToken: z.string(),
  error: z.string(),
  message: z.string().optional(),
});

export const sendActivityHeartbeatRequestSchema = /* @__PURE__ */ z.object({
  type: z.literal("Heartbeat"),
  activityToken: z.string(),
});

export const sendActivityUpdateSchema = /* @__PURE__ */ z.union([
  sendActivitySuccessRequestSchema,
  sendActivityFailureRequestSchema,
  sendActivityHeartbeatRequestSchema,
]);

export type SendActivityUpdate = z.infer<typeof sendActivityUpdateSchema>;

export interface SendActivitySuccessRequest<T = any>
  extends Omit<
    z.infer<typeof sendActivitySuccessRequestSchema>,
    "result" | "type"
  > {
  result?: T;
}

export interface SendActivityFailureRequest
  extends Omit<z.infer<typeof sendActivityFailureRequestSchema>, "type"> {}

export interface SendActivityHeartbeatRequest
  extends Omit<z.infer<typeof sendActivityHeartbeatRequestSchema>, "type"> {}

export function isSendActivitySuccessRequest<T = any>(
  request: SendActivityUpdate
): request is SendActivitySuccessRequest<T> & {
  type: "Success";
} {
  return request.type === "Success";
}

export function isSendActivityFailureRequest(
  request: SendActivityUpdate
): request is SendActivityFailureRequest & {
  type: "Failure";
} {
  return request.type === "Failure";
}

export function isSendActivityHeartbeatRequest(
  request: SendActivityUpdate
): request is SendActivityHeartbeatRequest & {
  type: "Heartbeat";
} {
  return request.type === "Heartbeat";
}

export interface SendActivityHeartbeatResponse {
  /**
   * True when the activity has been cancelled.
   *
   * This is the only way for a long running activity to know it was cancelled.
   */
  cancelled: boolean;
}

export interface EventualService {
  listWorkflows: Command<"listWorkflows", void, ListWorkflowsResponse>;
  publishEvents: Command<"publishEvents", PublishEventsRequest, void>;
  getExecution: Command<"getExecution", string, Execution<any> | undefined>;
  startExecution: Command<
    "startExecution",
    StartExecutionRequest,
    StartExecutionResponse
  >;
  listExecutions: Command<
    "listExecutions",
    ListExecutionsRequest,
    ListExecutionsResponse
  >;
  sendSignal: Command<"sendSignal", SendSignalRequestSchema, void>;
  getExecutionHistory: Command<
    "getExecutionHistory",
    ListExecutionEventsRequest,
    ListExecutionEventsResponse
  >;
  getExecutionWorkflowHistory: Command<
    "getExecutionWorkflowHistory",
    string,
    ExecutionHistoryResponse
  >;
  updateActivity: Command<
    "updateActivity",
    SendActivityUpdate,
    void | SendActivityHeartbeatResponse
  >;
}
