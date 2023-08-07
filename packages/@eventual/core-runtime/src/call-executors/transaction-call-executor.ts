import { EventualError } from "@eventual/core";
import type { InvokeTransactionCall } from "@eventual/core/internal";
import type { TransactionClient } from "../clients/transaction-client.js";
import type { CallExecutor } from "../eventual-hook.js";

export class TransactionCallExecutor
  implements CallExecutor<InvokeTransactionCall>
{
  constructor(private client: TransactionClient) {}
  public async execute(call: InvokeTransactionCall<any>): Promise<any> {
    const response = await this.client.executeTransaction({
      input: call.input,
      transaction: call.transactionName,
    });

    if (response.succeeded) {
      return response.output;
    } else {
      throw new EventualError(response.error, response.message);
    }
  }
}
