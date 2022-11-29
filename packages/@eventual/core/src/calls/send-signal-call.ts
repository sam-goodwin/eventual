import {
  isEventual,
  EventualSymbol,
  EventualKind,
  EventualBase,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import type { Resolved } from "../result.js";
import type { SignalTarget } from "../signals.js";

export function isSendSignalCall(a: any): a is SendSignalCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.SendSignalCall;
}

export interface SendSignalCall extends EventualBase<Resolved<void>> {
  [EventualSymbol]: EventualKind.SendSignalCall;
  seq?: number;
  signalId: string;
  payload?: any;
  target: SignalTarget;
}

export function createSendSignalCall(
  target: SignalTarget,
  signalId: string,
  payload?: any
): SendSignalCall {
  return registerEventual<SendSignalCall>({
    [EventualSymbol]: EventualKind.SendSignalCall,
    payload,
    signalId,
    target,
  });
}
