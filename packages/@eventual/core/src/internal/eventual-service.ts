import { z } from "zod";
import { Execution, ExecutionID, ExecutionStatus } from "../execution.js";
import { Command } from "../http/command.js";
import { ExecuteTransactionResponse } from "../service-client.js";
import { Transaction } from "../transaction.js";
import { eventEnvelopeSchema } from "./event.js";
import type { HistoryStateEvent, WorkflowEvent } from "./workflow-events.js";
import { workflowOptionsSchema } from "./workflow.js";

export const EVENTUAL_SYSTEM_COMMAND_NAMESPACE = "_system";

export const sortOrderSchema = z.enum(["ASC", "DESC"]);

// Note: all top level zod builder functions should be labelled with pure
// to avoid them being considered side effects and bundled
export const publishEventsRequestSchema = /* @__PURE__ */ z.object({
  events: /* @__PURE__ */ z.array(eventEnvelopeSchema),
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
  executionId: /* @__PURE__ */ z.string(),
  signalId: /* @__PURE__ */ z.string(),
  payload: /* @__PURE__ */ z.any(),
  id: /* @__PURE__ */ z.string().optional(),
});

export interface SendSignalRequestSchema
  extends z.infer<typeof sendSignalRequestSchema> {}

export const startExecutionRequestSchema =
  /* @__PURE__ */ workflowOptionsSchema.extend({
    executionName: /* @__PURE__ */ z.string().optional(),
    workflow: /* @__PURE__ */ z.string(),
    input: /* @__PURE__ */ z.any().optional(),
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
  statuses: /* @__PURE__ */ z.array(z.nativeEnum(ExecutionStatus)).optional(),
  workflowName: /* @__PURE__ */ z.string().optional(),
  nextToken: /* @__PURE__ */ z.string().optional(),
  sortDirection: /* @__PURE__ */ sortOrderSchema.default("ASC").optional(),
  maxResults: /* @__PURE__ */ z.number().default(100).optional(),
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
  executionId: /* @__PURE__ */ z.string(),
  sortDirection: /* @__PURE__ */ sortOrderSchema.default("ASC").optional(),
  nextToken: /* @__PURE__ */ z.string().optional(),
  maxResults: /* @__PURE__ */ z.number().default(100).optional(),
  after: /* @__PURE__ */ z
    .string()
    .optional()
    .describe("Start returning after a data"),
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
  type: /* @__PURE__ */ z.literal("Success"),
  activityToken: /* @__PURE__ */ z.string(),
  result: /* @__PURE__ */ z.any(),
});

export const sendActivityFailureRequestSchema = /* @__PURE__ */ z.object({
  type: /* @__PURE__ */ z.literal("Failure"),
  activityToken: /* @__PURE__ */ z.string(),
  error: /* @__PURE__ */ z.string(),
  message: /* @__PURE__ */ z.string().optional(),
});

export const sendActivityHeartbeatRequestSchema = /* @__PURE__ */ z.object({
  type: /* @__PURE__ */ z.literal("Heartbeat"),
  activityToken: /* @__PURE__ */ z.string(),
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

export const executeTransactionRequestSchema = /* @__PURE__ */ z.object({
  transactionName: /* @__PURE__ */ z.string(),
  input: /* @__PURE__ */ z.any().optional(),
});

export interface ExecuteTransactionRequest
  extends z.infer<typeof executeTransactionRequestSchema> {}

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
  executeTransaction: Command<
    "executeTransaction",
    ExecuteTransactionRequest,
    ExecuteTransactionResponse<Transaction>
  >;
}
