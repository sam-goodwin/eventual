export interface ExecutionContext {
  id: string;
  name: string;
  startTime: string;
}

export interface WorkflowContext {
  name: string;
}

export interface Context {
  workflow: WorkflowContext;
  execution: ExecutionContext;
}
