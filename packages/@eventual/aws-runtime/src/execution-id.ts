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

//API Gateway spews on uri encoding in path parameter... so we have these. for now
export function encodeExecutionId(executionId: string) {
  return Buffer.from(executionId, "utf-8").toString("base64");
}

export function decodeExecutionId(executionId: string) {
  return Buffer.from(executionId, "base64").toString("utf-8");
}
