import type { EntityTransactItem } from "@eventual/core";
import {
  WorkflowCallHistoryType,
  WorkflowEventType,
  isBucketRequest,
  isCallEvent,
  isChildWorkflowScheduled,
  isEntityOperationOfType,
  isEntityRequest,
  isSignalReceived,
  isSignalSent,
  isSocketRequest,
  isTaskScheduled,
  isTransactionRequest,
  type BucketRequest,
  type EntityOperation,
  type WorkflowEvent,
} from "@eventual/core/internal";
import chalk from "chalk";
import { formatTime } from "./time.js";

export function displayEvent(event: WorkflowEvent) {
  const lines: string[] = [
    `${chalk.green(formatTime(event.timestamp))}\t${chalk.blue(
      `${WorkflowEventType[event.type]}${
        isCallEvent(event)
          ? `-${chalk.blueBright(WorkflowCallHistoryType[event.event.type])}`
          : ""
      }`
    )}${
      "seq" in event
        ? `(${event.seq})`
        : isCallEvent(event)
        ? `(${event.event.seq})`
        : ""
    }`,
    ...(isCallEvent(event)
      ? [
          ...("operation" in event.event
            ? typeof event.event.operation === "object" &&
              "operation" in event.event.operation
              ? [`Operation: ${event.event.operation.operation}`]
              : [`Operation: ${event.event.operation}`]
            : []),
          ...(isSocketRequest(event.event)
            ? [`Socket: ${event.event.operation.socketName}`]
            : []),
          ...(isSocketRequest(event.event) &&
          event.event.operation.operation === "send"
            ? [`Input: ${event.event.operation.input}`]
            : []),
          ...(isChildWorkflowScheduled(event.event) ||
          isTaskScheduled(event.event)
            ? [`Task Name: ${JSON.stringify(event.event.name)}`]
            : []),
          ...(isTransactionRequest(event.event)
            ? [`Transaction Name: ${event.event.transactionName}`]
            : []),
          ...("signalId" in event.event
            ? [`Signal Id: ${event.event.signalId}`]
            : []),
          ...((isChildWorkflowScheduled(event.event) ||
            isTransactionRequest(event.event) ||
            isTaskScheduled(event.event)) &&
          event.event.input
            ? [`Payload: ${JSON.stringify(event.event.input)}`]
            : []),
          ...(isSignalSent(event.event) && event.event.payload
            ? [`Payload: ${JSON.stringify(event.event.payload)}`]
            : []),
          ...(isEntityRequest(event.event)
            ? displayEntityCommand(event.event.operation)
            : []),
          ...(isBucketRequest(event.event)
            ? displayBucketRequest(event.event)
            : []),
        ]
      : []),
    ...(isSignalReceived(event) && event.payload
      ? [`Payload: ${JSON.stringify(event.payload)}`]
      : []),
    ...("signalId" in event ? [`Signal Id: ${event.signalId}`] : []),
    ...("result" in event ? [`Result: ${JSON.stringify(event.result)}`] : []),
    ...("output" in event ? [`Output: ${JSON.stringify(event.output)}`] : []),
    ...("error" in event
      ? [`${chalk.red(event.error)}: ${event.message}`]
      : []),
  ];

  return lines.join("\n");
}

function displayEntityCommand(operation: EntityOperation) {
  const output: string[] = [`Operation: ${operation.operation}`];
  if (operation.operation === "transact") {
    output.push(`Transaction Items:`);
    output.push(
      ...operation.items.flatMap((item, i) => [
        `${i}:`,
        ...displayEntityTransactItem(item as EntityTransactItem).map(
          (v) => `\t${v}`
        ),
      ])
    );
  } else {
    output.push(`Ent: ${operation.entityName}`);
    if (
      isEntityOperationOfType("delete", operation) ||
      isEntityOperationOfType("get", operation) ||
      isEntityOperationOfType("getWithMetadata", operation)
    ) {
      const [key] = operation.params;
      output.push(`Key: ${JSON.stringify(key)}`);
    }
    if (isEntityOperationOfType("put", operation)) {
      const [value] = operation.params;
      output.push(`Entity: ${JSON.stringify(value)}`);
    }
    if (
      isEntityOperationOfType("put", operation) ||
      isEntityOperationOfType("delete", operation)
    ) {
      const [, options] = operation.params;
      if (options?.expectedVersion) {
        output.push(`Expected Version: ${options.expectedVersion}`);
      }
    }
    if (
      isEntityOperationOfType("query", operation) ||
      isEntityOperationOfType("queryIndex", operation)
    ) {
      if (isEntityOperationOfType("queryIndex", operation)) {
        output.push(`Index: ${operation.indexName}`);
      }
      const [key] = operation.params;
      output.push(`Key: ${JSON.stringify(key)}`);
    }
  }
  return output;
}

function displayEntityTransactItem(item: EntityTransactItem): string[] {
  const entityName =
    typeof item.entity === "string" ? item.entity : item.entity.name;
  if (item.operation === "put") {
    return displayEntityCommand({
      operation: "put",
      entityName,
      params: [item.value, item.options],
    });
  } else if (item.operation === "delete") {
    return displayEntityCommand({
      operation: "delete",
      entityName,
      params: [item.key, item.options],
    });
  } else {
    const output = [
      `Operation: ${item.operation}`,
      `Key: ${JSON.stringify(item.key)}`,
    ];
    if (item.version !== undefined) {
      output.push(`Version: ${item.version}`);
    }
    return output;
  }
}

function displayBucketRequest(request: BucketRequest) {
  const output: string[] = [`Operation: ${request.operation.operation}`];
  output.push(`Bucket: ${request.operation.bucketName}`);
  if (request.operation.operation === "put") {
    output.push(`Key: ${request.operation.key}`);
  } else {
    const [key] = request.operation.params;
    output.push(`Key: ${key}`);
  }
  return output;
}
