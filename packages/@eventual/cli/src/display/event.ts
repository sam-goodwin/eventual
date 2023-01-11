import {
  WorkflowEvent,
  isChildWorkflowScheduled,
  isActivityScheduled,
  isSignalReceived,
  isSignalSent,
} from "@eventual/core";
import chalk from "chalk";
import { formatTime } from "./time.js";

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
