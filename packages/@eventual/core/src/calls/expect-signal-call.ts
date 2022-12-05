import {
  isEventual,
  EventualSymbol,
  EventualKind,
  EventualBase,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Failed, Resolved } from "../result.js";

export function isExpectSignalCall(a: any): a is ExpectSignalCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.ExpectSignalCall;
}

export interface ExpectSignalCall<T = any>
  extends EventualBase<Resolved<T> | Failed> {
  [EventualSymbol]: EventualKind.ExpectSignalCall;
  seq?: number;
  signalId: string;
  timeoutSeconds?: number;
}

export function createExpectSignalCall(
  signalId: string,
  timeoutSeconds?: number
): ExpectSignalCall {
  return registerEventual<ExpectSignalCall>({
    [EventualSymbol]: EventualKind.ExpectSignalCall,
    timeoutSeconds,
    signalId: signalId,
  });
}
