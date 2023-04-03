import { z } from "zod";
import { Execution, ExecutionID, ExecutionStatus } from "../execution.js";
import type { Command } from "../http/command.js";
import type { ExecuteTransactionResponse } from "../service-client.js";
import type { Transaction } from "../transaction.js";
import { eventEnvelopeSchema } from "./event.js";
import type { HistoryStateEvent, WorkflowEvent } from "./workflow-events.js";
import { workflowOptionsSchema } from "./workflow.js";

export const EVENTUAL_SYSTEM_COMMAND_NAMESPACE = "_system";

export const sortOrderSchema = z.enum(["ASC", "DESC"]);

// Note: all top level zod builder functions should be labelled with pure
// to avoid them being considered side effects and bundled
export const emitEventsRequestSchema = /* @__PURE__ */ z.object({
  events: /* @__PURE__ */ z.array(eventEnvelopeSchema),
});

export interface EmitEventsRequest
  extends z.infer<typeof emitEventsRequestSchema> {}

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

export const sendTaskSuccessRequestSchema = /* @__PURE__ */ z.object({
  type: /* @__PURE__ */ z.literal("Success"),
  taskToken: /* @__PURE__ */ z.string(),
  result: /* @__PURE__ */ z.any(),
});

export const sendTaskFailureRequestSchema = /* @__PURE__ */ z.object({
  type: /* @__PURE__ */ z.literal("Failure"),
  taskToken: /* @__PURE__ */ z.string(),
  error: /* @__PURE__ */ z.string(),
  message: /* @__PURE__ */ z.string().optional(),
});

export const sendTaskHeartbeatRequestSchema = /* @__PURE__ */ z.object({
  type: /* @__PURE__ */ z.literal("Heartbeat"),
  taskToken: /* @__PURE__ */ z.string(),
});

export const sendTaskUpdateSchema = /* @__PURE__ */ z.union([
  sendTaskSuccessRequestSchema,
  sendTaskFailureRequestSchema,
  sendTaskHeartbeatRequestSchema,
]);

export type SendTaskUpdate = z.infer<typeof sendTaskUpdateSchema>;

export interface SendTaskSuccessRequest<T = any>
  extends Omit<
    z.infer<typeof sendTaskSuccessRequestSchema>,
    "result" | "type"
  > {
  result?: T;
}

export interface SendTaskFailureRequest
  extends Omit<z.infer<typeof sendTaskFailureRequestSchema>, "type"> {}

export interface SendTaskHeartbeatRequest
  extends Omit<z.infer<typeof sendTaskHeartbeatRequestSchema>, "type"> {}

export function isSendTaskSuccessRequest<T = any>(
  request: SendTaskUpdate
): request is SendTaskSuccessRequest<T> & {
  type: "Success";
} {
  return request.type === "Success";
}

export function isSendTaskFailureRequest(
  request: SendTaskUpdate
): request is SendTaskFailureRequest & {
  type: "Failure";
} {
  return request.type === "Failure";
}

export function isSendTaskHeartbeatRequest(
  request: SendTaskUpdate
): request is SendTaskHeartbeatRequest & {
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

export interface SendTaskHeartbeatResponse {
  /**
   * True when the task has been cancelled.
   *
   * This is the only way for a long running task to know it was cancelled.
   */
  cancelled: boolean;
}

export interface EventualService {
  listWorkflows: Command<"listWorkflows", void, ListWorkflowsResponse>;
  emitEvents: Command<"emitEvents", EmitEventsRequest, void>;
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
  updateTask: Command<
    "updateTask",
    SendTaskUpdate,
    void | SendTaskHeartbeatResponse
  >;
  executeTransaction: Command<
    "executeTransaction",
    ExecuteTransactionRequest,
    ExecuteTransactionResponse<Transaction>
  >;
}
