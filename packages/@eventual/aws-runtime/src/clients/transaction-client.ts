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

  public async executeTransaction(
    request: ExecuteTransactionRequest
  ): Promise<ExecuteTransactionResponse> {
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
      throw new Error("Invalid response from the transaction worker");
    }

    return JSON.parse(
      Buffer.from(response.Payload).toString("utf-8")
    ) as ExecuteTransactionResponse;
  }
}
