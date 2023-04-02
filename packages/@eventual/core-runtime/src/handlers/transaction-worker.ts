import {
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
} from "@eventual/core";
import { transactions } from "@eventual/core/internal";
import { EventClient } from "../clients/event-client.js";
import { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import { isResolved } from "../result.js";
import { DictionaryStore } from "../stores/dictionary-store.js";
import { createTransactionExecutor } from "../transaction-executor.js";

export interface TransactionWorkerProps {
  dictionaryStore: DictionaryStore;
  executionQueueClient: ExecutionQueueClient;
  eventClient: EventClient;
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
    props.dictionaryStore,
    props.executionQueueClient,
    props.eventClient
  );

  return async (request) => {
    console.log(request);
    const transaction = transactions().get(request.transaction as string);

    if (!transaction) {
      throw new Error("");
    }

    const output = await transactionExecutor(
      transaction?.handler,
      request.input,
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
