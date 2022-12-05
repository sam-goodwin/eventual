import {
  ScheduleActivityCommand,
  SleepForCommand,
  SleepUntilCommand,
  ExpectSignalCommand,
  ScheduleWorkflowCommand,
} from "../command.js";
import {
  ActivityScheduled,
  HistoryStateEvent,
  SleepScheduled,
  ExpectSignalStarted,
  ChildWorkflowScheduled,
} from "../events.js";
import { CompleteExecution, FailedExecution } from "../execution.js";

export interface CompleteExecutionRequest {
  executionId: string;
  result?: any;
}

export interface FailExecutionRequest {
  executionId: string;
  error: string;
  message: string;
}

export interface UpdateHistoryRequest {
  executionId: string;
  events: HistoryStateEvent[];
}

export interface ScheduleActivityRequest {
  workflowName: string;
  executionId: string;
  command: ScheduleActivityCommand;
  baseTime: Date;
}

export interface ScheduleWorkflowRequest {
  executionId: string;
  command: ScheduleWorkflowCommand;
  baseTime: Date;
}

export interface ScheduleSleepRequest {
  executionId: string;
  command: SleepUntilCommand | SleepForCommand;
  baseTime: Date;
}

export interface ExecuteExpectSignalRequest {
  executionId: string;
  command: ExpectSignalCommand;
  baseTime: Date;
}

export interface WorkflowRuntimeClient {
  getHistory(executionId: string): Promise<HistoryStateEvent[]>;

  // TODO: etag
  updateHistory(request: UpdateHistoryRequest): Promise<{ bytes: number }>;

  completeExecution(
    request: CompleteExecutionRequest
  ): Promise<CompleteExecution>;

  failExecution(request: FailExecutionRequest): Promise<FailedExecution>;

  scheduleChildWorkflow(
    request: ScheduleWorkflowRequest
  ): Promise<ChildWorkflowScheduled>;

  scheduleActivity(
    request: ScheduleActivityRequest
  ): Promise<ActivityScheduled>;

  scheduleSleep(request: ScheduleSleepRequest): Promise<SleepScheduled>;

  executionExpectSignal(
    request: ExecuteExpectSignalRequest
  ): Promise<ExpectSignalStarted>;
}
