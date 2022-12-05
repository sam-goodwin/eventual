import {
  isEventual,
  EventualSymbol,
  EventualKind,
  EventualBase,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Result } from "../result.js";
import { SignalTarget } from "../signals.js";

export function isSendSignalCall(a: any): a is SendSignalCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.SendSignalCall;
}

export interface SendSignalCall extends EventualBase<Resolved<void>> {
  [EventualSymbol]: EventualKind.SendSignalCall;
  seq?: number;
  signalId: string;
  payload?: any;
  target: SignalTarget;
  id?: string;
}

export function createSendSignalCall(
  target: SignalTarget,
  signalId: string,
  payload?: any,
  id?: string
): SendSignalCall {
  return registerEventual<SendSignalCall>({
    [EventualSymbol]: EventualKind.SendSignalCall,
    payload,
    signalId,
    target,
    id,
    /**
     * Send signal is modeled synchronously, but the {@link sendSignal} method
     * returns a promise. Ensure the SendSignalCall is always considered to be immediately resolved.
     */
    result: Result.resolved(undefined),
  });
}
