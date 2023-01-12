import { Execution, ExecutionStatus } from "@eventual/core";
import chalk from "chalk";
import { formatTime } from "./time.js";

export function displayExecution(
  execution: Execution,
  options?: { results?: boolean; workflow?: boolean }
) {
  const lines: string[] = [
    execution.status === ExecutionStatus.FAILED
      ? chalk.red(execution.id)
      : execution.status === ExecutionStatus.SUCCEEDED
      ? chalk.green(execution.id)
      : chalk.blue(execution.id),
    `Status: ${execution.status}`,
    `StartTime: ${formatTime(execution.startTime)}`,
    ...(execution.status !== ExecutionStatus.IN_PROGRESS
      ? [`EndTime: ${formatTime(execution.endTime)}`]
      : []),
    ...(options?.results && execution.status === ExecutionStatus.SUCCEEDED
      ? [`Result:\n${execution.result}`]
      : []),
    ...(options?.results && execution.status === ExecutionStatus.FAILED
      ? [`Error: ${execution.error}`]
      : []),
    ...(options?.results &&
    execution.status === ExecutionStatus.FAILED &&
    execution.message
      ? [`Message: ${execution.message}`]
      : []),
  ];

  return lines.join("\n");
}
