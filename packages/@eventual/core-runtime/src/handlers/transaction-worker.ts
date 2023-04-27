import type {
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
} from "@eventual/core";
import { transactions } from "@eventual/core/internal";
import type { EventClient } from "../clients/event-client.js";
import type { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import { isResolved } from "../result.js";
import type { EntityStore } from "../stores/entity-store.js";
import { createTransactionExecutor } from "../transaction-executor.js";
import { getLazy, LazyValue } from "../utils.js";

export interface TransactionWorkerProps {
  entityStore: EntityStore;
  executionQueueClient: ExecutionQueueClient;
  eventClient: EventClient;
  serviceName: LazyValue<string>;
}

export interface TransactionWorker {
  (
    executeTransaction: ExecuteTransactionRequest
  ): Promise<ExecuteTransactionResponse>;
}

export function createTransactionWorker(
  props: TransactionWorkerProps
): TransactionWorker {
  const transactionExecutor = createTransactionExecutor(
    props.entityStore,
    props.executionQueueClient,
    props.eventClient
  );

  return async (request) => {
    console.log(request);
    const transactionName =
      typeof request.transaction === "string"
        ? request.transaction
        : request.transaction.name;
    const transaction = transactions().get(transactionName);

    if (!transaction) {
      throw new Error(`Transaction ${transactionName} not found.`);
    }

    const output = await transactionExecutor(
      transaction?.handler,
      request.input,
      {
        service: {
          serviceName: getLazy(props.serviceName),
        },
      },
      // max retries
      100
    );

    if (isResolved(output.result)) {
      return { output: output.result.value, succeeded: true };
    } else {
      // todo: add reasons
      return { succeeded: false };
    }
  };
}
