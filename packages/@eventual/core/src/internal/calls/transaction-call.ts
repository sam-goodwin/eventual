import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isInvokeTransactionCall(a: any): a is InvokeTransactionCall {
  return isEventualCallOfKind(EventualCallKind.InvokeTransactionCall, a);
}

export interface InvokeTransactionCall<Input = any>
  extends EventualCallBase<EventualCallKind.InvokeTransactionCall> {
  input: Input;
  transactionName: string;
}
