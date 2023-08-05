import {
  createEventualCall,
  EventualCallKind,
  InvokeTransactionCall,
} from "./internal/calls.js";
import { registerEventualResource } from "./internal/global.js";
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

export interface Transaction<
  Name extends string = string,
  Input = any,
  Output = any
> extends TransactionSpec<Name> {
  kind: "Transaction";
  handler: TransactionFunction<Input, Output>;
  (input: Input): Promise<Awaited<Output>>;
}

export type TransactionInput<T extends Transaction> = T extends Transaction<
  any,
  infer Input
>
  ? Input
  : never;

export type TransactionOutput<T extends Transaction> = T extends Transaction<
  any,
  any,
  infer Output
>
  ? Output
  : never;

export function transaction<Name extends string, Input, Output>(
  name: Name,
  handler: TransactionFunction<Input, Output>
): Transaction<Name, Input, Output> {
  const transact: Transaction<Name, Input, Output> = ((
    input: Input
  ): Promise<Output> => {
    return getEventualHook().executeEventualCall(
      createEventualCall<InvokeTransactionCall>(
        EventualCallKind.InvokeTransactionCall,
        { input, transactionName: name }
      )
    );
  }) as any;

  transact.kind = "Transaction";
  transact.handler = handler;
  Object.defineProperty(transact, "name", { value: name, writable: false });
  return registerEventualResource("Transaction", transact);
}
