import { DictionaryConditionalOperation } from "@eventual/core";
import { normalizeCompositeKey } from "@eventual/core-runtime";
import {
  DictionaryOperation,
  WorkflowEvent,
  isActivityScheduled,
  isChildWorkflowScheduled,
  isDictionaryRequest,
  isSignalReceived,
  isSignalSent,
  isTransactionRequest,
} from "@eventual/core/internal";
import chalk from "chalk";
import { formatTime } from "./time.js";

export function displayEvent(event: WorkflowEvent) {
  const lines: string[] = [
    `${chalk.green(formatTime(event.timestamp))}\t${chalk.blue(event.type)}${
      "seq" in event ? `(${event.seq})` : ""
    }`,
    ...(isChildWorkflowScheduled(event) || isActivityScheduled(event)
      ? [`Activity Name: ${JSON.stringify(event.name)}`]
      : []),
    ...(isTransactionRequest(event)
      ? [`Transaction Name: ${event.transactionName}`]
      : []),
    ...("signalId" in event ? [`Signal Id: ${event.signalId}`] : []),
    ...((isChildWorkflowScheduled(event) || isTransactionRequest(event)) &&
    event.input
      ? [`Payload: ${JSON.stringify(event.input)}`]
      : []),
    ...((isSignalReceived(event) || isSignalSent(event)) && event.payload
      ? [`Payload: ${JSON.stringify(event.payload)}`]
      : []),
    ...(isDictionaryRequest(event)
      ? displayDictionaryCommand(event.operation)
      : []),
    ...("result" in event ? [`Result: ${JSON.stringify(event.result)}`] : []),
    ...("output" in event ? [`Output: ${JSON.stringify(event.output)}`] : []),
    ...("error" in event
      ? [`${chalk.red(event.error)}: ${event.message}`]
      : []),
  ];

  return lines.join("\n");
}

function displayDictionaryCommand(
  operation: DictionaryOperation | DictionaryConditionalOperation
) {
  const output: string[] = [`Operation: ${operation.operation}`];
  if (operation.operation === "transact") {
    output.push(`Transaction Items:`);
    output.push(
      ...operation.items.flatMap((item, i) => [
        `${i}:`,
        ...displayDictionaryCommand({
          ...item.operation,
          name:
            typeof item.dictionary === "string"
              ? item.dictionary
              : item.dictionary.name,
        }).map((v) => `\t${v}`),
      ])
    );
  } else {
    output.push(`Dict: ${operation.name}`);
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
  }
  return output;
}
