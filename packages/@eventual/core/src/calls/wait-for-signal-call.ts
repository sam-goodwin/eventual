import {
  isEventual,
  EventualSymbol,
  EventualKind,
  EventualBase,
} from "../eventual.js";
import { registerActivity } from "../global.js";
import { Failed, Resolved } from "../result.js";

export function isWaitForSignalCall(a: any): a is WaitForSignalCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.WaitForSignalCall;
}

export interface WaitForSignalCall<T = any>
  extends EventualBase<Resolved<T> | Failed> {
  [EventualSymbol]: EventualKind.WaitForSignalCall;
  seq?: number;
  signalId: string;
  timeoutSeconds?: number;
}

export function createWaitForSignalCall(
  signalId: string,
  timeoutSeconds?: number
): WaitForSignalCall {
  return registerActivity<WaitForSignalCall>({
    [EventualSymbol]: EventualKind.WaitForSignalCall,
    timeoutSeconds,
    signalId: signalId,
  });
}
