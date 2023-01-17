export type ExecutionID<
  WorkflowName extends string = string,
  ID extends string = string
> = `${WorkflowName}/${ID}`;

export function isExecutionId(a: any): a is ExecutionID {
  return typeof a === "string" && a.split("/").length === 2;
}

export function parseWorkflowName(executionId: ExecutionID): string {
  return executionId.split("/")[0]!;
}

export function formatExecutionId<
  WorkflowName extends string,
  ID extends string
>(workflowName: string, id: string): ExecutionID<WorkflowName, ID> {
  return `${workflowName}/${id}` as ExecutionID<WorkflowName, ID>;
}

// API Gateway doesn't agree with uri encoding in path parameter... so we have these. for now
export function encodeExecutionId(executionId: string) {
  return Buffer.from(executionId, "utf-8").toString("base64");
}

export function decodeExecutionId(executionId: string) {
  return Buffer.from(executionId, "base64").toString("utf-8");
}

export const INTERNAL_EXECUTION_ID_PREFIX = "%";

/**
 * Formats an child workflow execution as a unique, deterministic name.
 * 1. we prefix it with {@link INTERNAL_EXECUTION_ID_PREFIX} to ensure it is impossible for a user to create it.
 * 2. we construct the name from the parent execution ID and the seq - this ensures uniqueness and is deterministic
 *
 * It must be deterministic to ensure idempotency.
 *
 * @param parentExecutionId id of the caller execution used to compute the child workflow name
 * @param seq position that started the child workflow
 */
export function formatChildExecutionName(
  parentExecutionId: string,
  seq: number
): string {
  return `${INTERNAL_EXECUTION_ID_PREFIX}${parentExecutionId.replace(
    "/",
    "-"
  )}-${seq}`;
}
