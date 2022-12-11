import {
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Failed, Resolved } from "../result.js";

export function isExpectSignalCall(a: any): a is ExpectSignalCall {
  return isEventualOfKind(EventualKind.ExpectSignalCall, a);
}

export interface ExpectSignalCall<T = any>
  extends EventualBase<EventualKind.ExpectSignalCall, Resolved<T> | Failed> {
  seq?: number;
  signalId: string;
  timeoutSeconds?: number;
}

export function createExpectSignalCall(
  signalId: string,
  timeoutSeconds?: number
): ExpectSignalCall {
  return registerEventual(
    createEventual(EventualKind.ExpectSignalCall, {
      timeoutSeconds,
      signalId,
    })
  );
}
