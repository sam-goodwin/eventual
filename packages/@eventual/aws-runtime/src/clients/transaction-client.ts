import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
} from "@eventual/core";
import { getLazy, LazyValue, TransactionClient } from "@eventual/core-runtime";

export interface AWSTransactionClientProps {
  lambda: LambdaClient;
  transactionWorkerFunctionArn: LazyValue<string>;
}

export class AWSTransactionClient implements TransactionClient {
  constructor(private props: AWSTransactionClientProps) {}

  async executeTransaction(
    request: ExecuteTransactionRequest
  ): Promise<ExecuteTransactionResponse> {
    console.debug("Invoking Transaction: ", request.transaction);
    const response = await this.props.lambda.send(
      new InvokeCommand({
        FunctionName: getLazy(this.props.transactionWorkerFunctionArn),
        Payload:
          request.input !== undefined
            ? Buffer.from(JSON.stringify(request))
            : undefined,
      })
    );

    if (!response.Payload) {
      console.error(
        "Transaction Returned Invalid Response: ",
        request.transaction,
        response.FunctionError
      );
      throw new Error("Invalid response from the transaction worker");
    }

    console.debug("Transaction Complete: ", request.transaction);

    return JSON.parse(
      Buffer.from(response.Payload).toString("utf-8")
    ) as ExecuteTransactionResponse;
  }
}
