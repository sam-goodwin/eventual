import {
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
  Transaction,
} from "@eventual/core";
import { TransactionClient } from "../../clients/transaction-client.js";
import { TransactionWorker } from "../../handlers/transaction-worker.js";

export class LocalTransactionClient implements TransactionClient {
  constructor(private transactionWorker: TransactionWorker) {}

  executeTransaction(
    request: ExecuteTransactionRequest<Transaction<any, any>>
  ): Promise<ExecuteTransactionResponse<Transaction<any, any>>> {
    return this.transactionWorker(request);
  }
}
