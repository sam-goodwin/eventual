import type {
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
} from "@eventual/core";
import { ServiceType, getEventualResource } from "@eventual/core/internal";
import {
  AllPropertyRetriever,
  UnsupportedPropertyRetriever,
} from "../property-retriever.js";
import { SocketUrlPropertyRetriever } from "../property-retrievers/socket-url-property-retriever.js";
import type { EntityProvider } from "../providers/entity-provider.js";
import { isResolved, normalizeFailedResult } from "../result.js";
import type { EntityStore } from "../stores/entity-store.js";
import {
  TransactionCallExecutorDependencies,
  createTransactionCallExecutor,
  createTransactionExecutor,
} from "../transaction-executor.js";
import { getLazy, type LazyValue } from "../utils.js";

export interface TransactionWorkerProps
  extends TransactionCallExecutorDependencies {
  entityStore: EntityStore;
  entityProvider: EntityProvider;
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
    QueuePhysicalName: unsupportedPropertyRetriever,
    ServiceClient: unsupportedPropertyRetriever,
    ServiceName: props.serviceName,
    ServiceSpec: unsupportedPropertyRetriever,
    ServiceType: ServiceType.TransactionWorker,
    ServiceUrl: unsupportedPropertyRetriever,
    SocketUrls: new SocketUrlPropertyRetriever(props.socketClient),
    TaskToken: unsupportedPropertyRetriever,
  });
  const transactionExecutor = createTransactionExecutor(
    props.entityStore,
    props.entityProvider,
    createTransactionCallExecutor(props),
    propertyRetriever
  );

  return async (request) => {
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
