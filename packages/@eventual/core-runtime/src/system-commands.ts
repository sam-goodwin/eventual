import { AnyCommand, api, command, HttpResponse } from "@eventual/core";
import {
  assertNever,
  EVENTUAL_SYSTEM_COMMAND_NAMESPACE,
  EventualService,
  executeTransactionRequestSchema,
  extendsError,
  isSendTaskFailureRequest,
  isSendTaskHeartbeatRequest,
  isSendTaskSuccessRequest,
  listExecutionEventsRequestSchema,
  listExecutionsRequestSchema,
  publishEventsRequestSchema,
  sendSignalRequestSchema,
  sendTaskUpdateSchema,
  startExecutionRequestSchema,
} from "@eventual/core/internal";
import util from "util";
import { z } from "zod";
import type { EventClient } from "./clients/event-client.js";
import type { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import type { TaskClient } from "./clients/task-client.js";
import type { WorkflowClient } from "./clients/workflow-client.js";
import type { TransactionClient } from "./index.js";
import type { WorkflowSpecProvider } from "./providers/workflow-provider.js";
import type { ExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import type { ExecutionHistoryStore } from "./stores/execution-history-store.js";
import type { ExecutionStore } from "./stores/execution-store.js";

const withErrorHandling = api.use(async ({ next, context }) => {
  try {
    return next(context);
  } catch (err) {
    return new HttpResponse(
      JSON.stringify(
        extendsError(err)
          ? {
              error: err.name,
              message: err.message,
              stack: err.stack,
            }
          : { error: util.inspect(err) },
        null,
        2
      ),
      {
        status: 500,
      }
    );
  }
});

export function createStartExecutionCommand({
  workflowClient,
}: {
  workflowClient: WorkflowClient;
}): EventualService["startExecution"] {
  return systemCommand(
    withErrorHandling.command(
      "startExecution",
      { input: startExecutionRequestSchema },
      (request) => {
        return workflowClient.startExecution({
          input: request.input,
          workflow: request.workflow,
          executionName: request.executionName,
          timeout: request.timeout,
        });
      }
    )
  );
}

export function createPublishEventsCommand({
  eventClient,
}: {
  eventClient: EventClient;
}): EventualService["publishEvents"] {
  return systemCommand(
    withErrorHandling.command(
      "publishEvents",
      { input: publishEventsRequestSchema },
      (request) => {
        return eventClient.publishEvents(...request.events);
      }
    )
  );
}

export function createUpdateTaskCommand({
  taskClient,
}: {
  taskClient: TaskClient;
}): EventualService["updateTask"] {
  return systemCommand(
    withErrorHandling.command(
      "updateTask",
      { input: sendTaskUpdateSchema },
      async (request) => {
        if (isSendTaskSuccessRequest(request)) {
          return taskClient.sendSuccess(request);
        } else if (isSendTaskFailureRequest(request)) {
          return taskClient.sendFailure(request);
        } else if (isSendTaskHeartbeatRequest(request)) {
          return taskClient.sendHeartbeat(request);
        }
        return assertNever(request, "Invalid task update request");
      }
    )
  );
}

export function createListWorkflowsCommand({
  workflowProvider,
}: {
  workflowProvider: WorkflowSpecProvider;
}): EventualService["listWorkflows"] {
  return systemCommand(
    withErrorHandling.command("listWorkflows", () => ({
      workflows: Array.from(workflowProvider.getWorkflowNames()).map((w) => ({
        name: w,
      })),
    }))
  );
}

export function createListWorkflowHistoryCommand({
  executionHistoryStateStore,
}: {
  executionHistoryStateStore: ExecutionHistoryStateStore;
}): EventualService["getExecutionWorkflowHistory"] {
  return systemCommand(
    withErrorHandling.command(
      "getExecutionWorkflowHistory",
      { input: z.string() },
      async (executionId) => ({
        events: await executionHistoryStateStore.getHistory(executionId),
      })
    )
  );
}

export function createListExecutionsCommand({
  executionStore,
}: {
  executionStore: ExecutionStore;
}): EventualService["listExecutions"] {
  return systemCommand(
    withErrorHandling.command(
      "listExecutions",
      { input: listExecutionsRequestSchema },
      (request) => executionStore.list(request)
    )
  );
}

export function createListExecutionHistoryCommand({
  executionHistoryStore,
}: {
  executionHistoryStore: ExecutionHistoryStore;
}): EventualService["getExecutionHistory"] {
  return systemCommand(
    command(
      "getExecutionHistory",
      { input: listExecutionEventsRequestSchema },
      (request) => executionHistoryStore.getEvents(request)
    )
  );
}

export function createGetExecutionCommand({
  executionStore,
}: {
  executionStore: ExecutionStore;
}): EventualService["getExecution"] {
  return systemCommand(
    withErrorHandling.command(
      "getExecution",
      { input: z.string() },
      (executionId) => executionStore.get(executionId)
    )
  );
}

export function createSendSignalCommand({
  executionQueueClient,
}: {
  executionQueueClient: ExecutionQueueClient;
}): EventualService["sendSignal"] {
  return systemCommand(
    withErrorHandling.command(
      "sendSignal",
      { input: sendSignalRequestSchema },
      (request) =>
        executionQueueClient.sendSignal({
          id: request.id,
          payload: request.payload,
          execution: request.executionId,
          signal: request.signalId,
        })
    )
  );
}

export function createExecuteTransactionCommand({
  transactionClient,
}: {
  transactionClient: TransactionClient;
}): EventualService["executeTransaction"] {
  return systemCommand(
    withErrorHandling.command(
      "executeTransaction",
      { input: executeTransactionRequestSchema },
      (request) =>
        transactionClient.executeTransaction({
          input: request.input,
          transaction: request.transactionName,
        })
    )
  );
}

function systemCommand<C extends AnyCommand>(c: C): C {
  c.namespace = EVENTUAL_SYSTEM_COMMAND_NAMESPACE;
  return c;
}
