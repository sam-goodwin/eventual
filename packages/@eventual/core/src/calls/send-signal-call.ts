import {
  isEventual,
  EventualSymbol,
  EventualKind,
  EventualBase,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved } from "../result.js";

export function isSendSignalCall(a: any): a is SendSignalCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.SendSignalCall;
}

export interface SendSignalCall extends EventualBase<Resolved<void>> {
  [EventualSymbol]: EventualKind.SendSignalCall;
  seq?: number;
  signalId: string;
  payload?: any;
  executionId: string;
}

export function createSendEventCall(
  executionId: string,
  signalId: string,
  payload?: any
): SendSignalCall {
  return registerEventual<SendSignalCall>({
    [EventualSymbol]: EventualKind.SendSignalCall,
    payload,
    signalId,
    executionId,
  });
}
