export type SignalTarget = ExecutionTarget | ChildExecutionTarget;

export enum SignalTargetType {
  Execution,
  ChildExecution,
}

export interface ExecutionTarget {
  type: SignalTargetType.Execution;
  executionId: string;
}

export interface ChildExecutionTarget {
  type: SignalTargetType.ChildExecution;
  workflowName: string;
  seq: number;
}

export function isChildExecutionTarget(
  target: SignalTarget
): target is ChildExecutionTarget {
  return target.type === SignalTargetType.ChildExecution;
}

export function isExecutionTarget(
  target: SignalTarget
): target is ExecutionTarget {
  return target.type === SignalTargetType.Execution;
}
