import { SignalTarget } from "../../signals.js";
import {
  createEventual,
  EventualBase,
  EventualKind,
  isEventualOfKind,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Result } from "../result.js";

export function isSendSignalCall(a: any): a is SendSignalCall {
  return isEventualOfKind(EventualKind.SendSignalCall, a);
}

export interface SendSignalCall
  extends EventualBase<EventualKind.SendSignalCall, Resolved<void>> {
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
  return registerEventual(
    createEventual(EventualKind.SendSignalCall, {
      payload,
      signalId,
      target,
      id,
      /**
       * Send signal is modeled synchronously, but the {@link sendSignal} method
       * returns a promise. Ensure the SendSignalCall is always considered to be immediately resolved.
       */
      result: Result.resolved(undefined),
    })
  );
}
