import type {
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
} from "@eventual/core";
import { getEventualResource } from "@eventual/core/internal";
import type { EventClient } from "../clients/event-client.js";
import type { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import {
  AllPropertyRetriever,
  UnsupportedPropertyRetriever,
} from "../index.js";
import type { EntityProvider } from "../providers/entity-provider.js";
import { isResolved, normalizeFailedResult } from "../result.js";
import type { EntityStore } from "../stores/entity-store.js";
import { createTransactionExecutor } from "../transaction-executor.js";
import { getLazy, type LazyValue } from "../utils.js";

export interface TransactionWorkerProps {
  entityStore: EntityStore;
  entityProvider: EntityProvider;
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
  const unsupportedPropertyRetriever = new UnsupportedPropertyRetriever(
    "Transaction Worker"
  );
  const propertyRetriever = new AllPropertyRetriever({
    BucketPhysicalName: unsupportedPropertyRetriever,
    OpenSearchClient: unsupportedPropertyRetriever,
    ServiceName: props.serviceName,
    ServiceUrl: unsupportedPropertyRetriever,
    ServiceClient: unsupportedPropertyRetriever,
    ServiceSpec: unsupportedPropertyRetriever,
  });
  const transactionExecutor = createTransactionExecutor(
    props.entityStore,
    props.entityProvider,
    props.executionQueueClient,
    props.eventClient,
    propertyRetriever
  );

  return async (request) => {
    console.log(request);
    const transactionName =
      typeof request.transaction === "string"
        ? request.transaction
        : request.transaction.name;
    const transaction = getEventualResource("Transaction", transactionName);

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
      return { succeeded: false, ...normalizeFailedResult(output.result) };
    }
  };
}
