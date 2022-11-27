import { createSendEventCall } from "./calls/send-signal-call.js";
import { SignalPayload, Signal } from "./signals.js";
import { Workflow } from "./workflow.js";

export enum ExecutionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
}

interface ExecutionBase {
  id: string;
  status: ExecutionStatus;
  startTime: string;
}

interface ExecutionReference {
  id: string;
  workflow: Workflow;
  send<E extends Signal<any>>(event: E, payload: SignalPayload<E>): void;
}

export function createExecutionReference(
  executionId: string,
  workflow: Workflow
): ExecutionReference {
  return {
    id: executionId,
    workflow,
    send: (event, payload) =>
      createSendEventCall(executionId, event.id, payload),
  };
}

export type Execution =
  | InProgressExecution
  | CompleteExecution
  | FailedExecution;

export interface InProgressExecution extends ExecutionBase {
  status: ExecutionStatus.IN_PROGRESS;
}

export interface CompleteExecution extends ExecutionBase {
  status: ExecutionStatus.COMPLETE;
  endTime: string;
  result?: any;
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
