import serviceSpec from "@eventual/injected/spec";

import type { AnyCommand } from "@eventual/core";
import {
  createCommandWorker,
  createExecuteTransactionCommand,
  createGetExecutionCommand,
  createListExecutionHistoryCommand,
  createListExecutionsCommand,
  createListWorkflowHistoryCommand,
  createListWorkflowsCommand,
  createPublishEventsCommand,
  createSendSignalCommand,
  createStartExecutionCommand,
  createUpdateActivityCommand,
  ServiceSpecWorkflowProvider,
} from "@eventual/core-runtime";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  createActivityClient,
  createEventClient,
  createExecutionHistoryStateStore,
  createExecutionHistoryStore,
  createExecutionQueueClient,
  createExecutionStore,
  createTransactionClient,
  createWorkflowClient,
} from "../create.js";
import { createApiGCommandAdaptor } from "./apig-command-adapter.js";

function systemCommandWorker(
  ..._commands: AnyCommand[]
): APIGatewayProxyHandlerV2<Response> {
  return createApiGCommandAdaptor({
    commandWorker: createCommandWorker({}),
  });
}

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);
const workflowClient = createWorkflowClient({
  workflowProvider,
});
const executionStore = createExecutionStore();

export default systemCommandWorker(
  createListExecutionHistoryCommand({
    executionHistoryStore: createExecutionHistoryStore(),
  }),
  createListWorkflowHistoryCommand({
    executionHistoryStateStore: createExecutionHistoryStateStore(),
  }),
  createGetExecutionCommand({ executionStore }),
  createListExecutionsCommand({
    executionStore,
  }),
  createListWorkflowsCommand({
    workflowProvider,
  }),
  createPublishEventsCommand({
    eventClient: createEventClient(),
  }),
  createSendSignalCommand({
    executionQueueClient: createExecutionQueueClient(),
  }),
  createStartExecutionCommand({
    workflowClient,
  }),
  createUpdateActivityCommand({ activityClient: createActivityClient() }),
  createExecuteTransactionCommand({
    transactionClient: createTransactionClient(),
  })
);
