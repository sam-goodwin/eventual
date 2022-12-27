export enum ExecutionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
}

interface ExecutionBase {
  id: string;
  status: ExecutionStatus;
  startTime: string;
  parent?: {
    /**
     * Seq number when this execution is the child of another workflow.
     */
    seq: number;
    /**
     * Id of the parent workflow, while present.
     */
    executionId: string;
  };
}

export type Execution<Result = any> =
  | InProgressExecution
  | CompleteExecution<Result>
  | FailedExecution;

export interface InProgressExecution extends ExecutionBase {
  status: ExecutionStatus.IN_PROGRESS;
}

export interface CompleteExecution<Result = any> extends ExecutionBase {
  status: ExecutionStatus.COMPLETE;
  endTime: string;
  result?: Result;
}

export interface FailedExecution extends ExecutionBase {
  status: ExecutionStatus.FAILED;
  endTime: string;
  error: string;
  message: string;
}

export function isFailedExecution(
  execution: Execution
): execution is FailedExecution {
  return execution.status === ExecutionStatus.FAILED;
}

export function isCompleteExecution(
  execution: Execution
): execution is CompleteExecution {
  return execution.status === ExecutionStatus.COMPLETE;
}
