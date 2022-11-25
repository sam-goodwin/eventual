import {
  ScheduleActivityCommand,
  SleepForCommand,
  SleepUntilCommand,
} from "../command.js";
import {
  ActivityScheduled,
  HistoryStateEvent,
  SleepScheduled,
} from "../events.js";
import { CompleteExecution, Execution, FailedExecution } from "../execution.js";
import { TimerClient } from "./timer-client.js";

export interface CompleteExecutionRequest {
  executionId: string;
  result?: any;
  readonly timerClient: TimerClient;
}

export interface WorkflowRuntimeClient {
  getHistory(executionId: string): Promise<HistoryStateEvent[]>;

  // TODO: etag
  updateHistory(
    executionId: string,
    events: HistoryStateEvent[]
  ): Promise<{ bytes: number }>;

  completeExecution({
    executionId,
    result,
  }: CompleteExecutionRequest): Promise<CompleteExecution>;

  failExecution(
    executionId: string,
    error: string,
    message: string
  ): Promise<FailedExecution>;

  getExecutions(): Promise<Execution[]>;

  scheduleActivity(
    workflowName: string,
    executionId: string,
    command: ScheduleActivityCommand
  ): Promise<ActivityScheduled>;

  scheduleSleep(
    executionId: string,
    command: SleepUntilCommand | SleepForCommand,
    baseTime: Date
  ): Promise<SleepScheduled>;
}
