import {
  Execution,
  ExecutionStatus,
  isActivityScheduled,
  isChildWorkflowScheduled,
  isSignalReceived,
  isSignalSent,
  WorkflowEvent,
} from "@eventual/core";
import chalk from "chalk";

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

export function displayEvent(event: WorkflowEvent) {
  const lines: string[] = [
    `${chalk.green(formatTime(event.timestamp))}\t${chalk.blue(event.type)}${
      "seq" in event ? `(${event.seq})` : ""
    }`,
    ...(isChildWorkflowScheduled(event) || isActivityScheduled(event)
      ? [`Activity Name:\t${JSON.stringify(event.name)}`]
      : []),
    ...("signalId" in event ? [`Signal Id:\t${event.signalId}`] : []),
    ...(isChildWorkflowScheduled(event) && event.input
      ? [`Payload:\t${JSON.stringify(event.input)}`]
      : []),
    ...((isSignalReceived(event) || isSignalSent(event)) && event.payload
      ? [`Payload:\t${JSON.stringify(event.payload)}`]
      : []),
    ...("result" in event ? [`Result:\t${JSON.stringify(event.result)}`] : []),
    ...("output" in event ? [`Output:\t${JSON.stringify(event.output)}`] : []),
    ...("error" in event ? [`${event.error}: ${event.message}`] : []),
  ];

  return lines.join("\n");
}

function formatTime(time: string | number) {
  return new Date(time).toLocaleString();
}
