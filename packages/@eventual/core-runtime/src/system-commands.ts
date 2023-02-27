import { AnyCommand, api, command, HttpResponse } from "@eventual/core";
import {
  assertNever,
  EVENTUAL_INTERNAL_COMMAND_NAMESPACE,
  extendsError,
  isSendActivityFailureRequest,
  isSendActivityHeartbeatRequest,
  isSendActivitySuccessRequest,
  listExecutionEventsRequestSchema,
  listExecutionsRequestSchema,
  publishEventsRequestSchema,
  sendActivityUpdateSchema,
  sendSignalRequestSchema,
  startExecutionRequestSchema,
} from "@eventual/core/internal";
import { z } from "zod";
import type { ActivityClient } from "./clients/activity-client.js";
import type { EventClient } from "./clients/event-client.js";
import type { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import type { WorkflowClient } from "./clients/workflow-client.js";
import type { WorkflowSpecProvider } from "./providers/workflow-provider.js";
import type { ExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import type { ExecutionHistoryStore } from "./stores/execution-history-store.js";
import type { ExecutionStore } from "./stores/execution-store.js";
import util from "util";

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

export function createNewCommand({
  workflowClient,
}: {
  workflowClient: WorkflowClient;
}) {
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
}) {
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

export function createUpdateActivityCommand({
  activityClient,
}: {
  activityClient: ActivityClient;
}) {
  return systemCommand(
    withErrorHandling.command(
      "updateActivity",
      { input: sendActivityUpdateSchema },
      async (request) => {
        if (isSendActivitySuccessRequest(request)) {
          return activityClient.sendSuccess(request);
        } else if (isSendActivityFailureRequest(request)) {
          return activityClient.sendFailure(request);
        } else if (isSendActivityHeartbeatRequest(request)) {
          return activityClient.sendHeartbeat(request);
        }
        return assertNever(request, "Invalid activity update request");
      }
    )
  );
}

export function createListWorkflowsCommand({
  workflowProvider,
}: {
  workflowProvider: WorkflowSpecProvider;
}) {
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
}) {
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
}) {
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
}) {
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
}) {
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
}) {
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

function systemCommand<C extends AnyCommand>(c: C): C {
  c.namespace = EVENTUAL_INTERNAL_COMMAND_NAMESPACE;
  return c;
}
