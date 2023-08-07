import {
  TransactionRequestFailed,
  TransactionRequestSucceeded,
  WorkflowEventType,
} from "@eventual/core/internal";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { TransactionClient } from "../../clients/transaction-client.js";
import { TransactionCallExecutor } from "../../call-executors/transaction-call-executor.js";
import { normalizeError } from "../../result.js";
import { createEvent } from "../events.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adaptor.js";

export function createTransactionWorkflowQueueExecutor(
  transactionClient: TransactionClient,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    new TransactionCallExecutor(transactionClient),
    queueClient,
    (_, result, { executionTime, seq }) => {
      if (result.succeeded) {
        return createEvent<TransactionRequestSucceeded>(
          {
            type: WorkflowEventType.TransactionRequestSucceeded,
            result: result.output,
            seq,
          },
          executionTime
        );
      } else {
        return createEvent<TransactionRequestFailed>(
          {
            type: WorkflowEventType.TransactionRequestFailed,
            error: "Transaction Failed",
            message: "",
            seq,
          },
          executionTime
        );
      }
    },
    (_, err, { executionTime, seq }) => {
      return createEvent<TransactionRequestFailed>(
        {
          type: WorkflowEventType.TransactionRequestFailed,
          ...normalizeError(err),
          seq,
        },
        executionTime
      );
    }
  );
}
