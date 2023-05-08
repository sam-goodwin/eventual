import { EventualError } from "./error.js";
import {
  createEventualCall,
  EventualCallKind,
  InvokeTransactionCall,
} from "./internal/calls.js";
import { getServiceClient, transactions } from "./internal/global.js";
import { TransactionSpec } from "./internal/service-spec.js";
import { ServiceContext } from "./service.js";

export interface TransactionContext {
  /**
   *Information about the containing service.
   */
  service: Omit<ServiceContext, "serviceUrl">;
}

export interface TransactionFunction<Input, Output> {
  (input: Input, context: TransactionContext): Promise<Output> | Output;
}

export interface Transaction<Input = any, Output = any>
  extends TransactionSpec {
  kind: "Transaction";
  handler: TransactionFunction<Input, Output>;
  (input: Input): Promise<Awaited<Output>>;
}

export type TransactionInput<T extends Transaction> = T extends Transaction<
  infer Input
>
  ? Input
  : never;

export type TransactionOutput<T extends Transaction> = T extends Transaction<
  any,
  infer Output
>
  ? Output
  : never;

export function transaction<Input, Output>(
  name: string,
  handler: TransactionFunction<Input, Output>
): Transaction<Input, Output> {
  if (transactions().has(name)) {
    throw new Error(`workflow with name '${name}' already exists`);
  }

  const transact: Transaction<Input, Output> = ((
    input: Input
  ): Promise<Output> => {
    return getEventualCallHook().registerEventualCall(
      createEventualCall<InvokeTransactionCall>(
        EventualCallKind.InvokeTransactionCall,
        { input, transactionName: name }
      ),
      async () => {
        const response = await getServiceClient().executeTransaction({
          input,
          transaction: transact,
        });

        if (response.succeeded) {
          return response.output;
        } else {
          throw new EventualError(response.error, response.message);
        }
      }
    );
  }) as any;

  transact.kind = "Transaction";
  transact.handler = handler;
  Object.defineProperty(transact, "name", { value: name, writable: false });
  transactions().set(name, transact);
  return transact;
}
