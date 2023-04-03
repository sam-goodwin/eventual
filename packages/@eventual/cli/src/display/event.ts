import { normalizeCompositeKey } from "@eventual/core-runtime";
import {
  DictionaryRequest,
  WorkflowEvent,
  isActivityScheduled,
  isChildWorkflowScheduled,
  isDictionaryRequest,
  isSignalReceived,
  isSignalSent,
} from "@eventual/core/internal";
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
    ...(isDictionaryRequest(event) ? [displayDictionaryCommand(event)] : []),
    ...("result" in event ? [`Result:\t${JSON.stringify(event.result)}`] : []),
    ...("output" in event ? [`Output:\t${JSON.stringify(event.output)}`] : []),
    ...("error" in event
      ? [`${chalk.red(event.error)}: ${event.message}`]
      : []),
  ];

  return lines.join("\n");
}

function displayDictionaryCommand(request: DictionaryRequest) {
  if (request.operation.operation === "transact") {
    return "TODO";
  } else {
    const output: string[] = [
      `Dict: ${request.operation.name}`,
      `Operation: ${request.operation.operation}`,
    ];
    const operation = request.operation;

    if ("key" in operation) {
      const { key, namespace } = normalizeCompositeKey(operation.key);
      if (namespace) {
        output.push(`Namespace: ${namespace}`);
      }
      output.push(`Key: ${key}`);
      if (operation.operation === "set") {
        output.push(`Entity: ${JSON.stringify(operation.value)}`);
        if (operation.options?.expectedVersion) {
          output.push(`Expected Version: ${operation.options.expectedVersion}`);
        }
      }
    } else {
      if (operation.request.namespace) {
        output.push(`Namespace: ${operation.request.prefix}`);
      }
      if (operation.request.prefix) {
        output.push(`Prefix: ${operation.request.prefix}`);
      }
    }

    return output.join("\n");
  }
}
