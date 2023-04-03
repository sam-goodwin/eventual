import {
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
} from "@eventual/core";

export interface TransactionClient {
  executeTransaction(
    request: ExecuteTransactionRequest
  ): Promise<ExecuteTransactionResponse>;
}
