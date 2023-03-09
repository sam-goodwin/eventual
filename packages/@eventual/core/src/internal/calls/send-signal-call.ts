import { EventualPromise, getWorkflowHook } from "../eventual-hook.js";
import { SignalTarget } from "../signal.js";
import {
  createEventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isSendSignalCall(a: any): a is SendSignalCall {
  return isEventualCallOfKind(EventualCallKind.SendSignalCall, a);
}

export interface SendSignalCall
  extends EventualCallBase<EventualCallKind.SendSignalCall> {
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
): EventualPromise<void> {
  return getWorkflowHook().registerEventualCall(
    createEventualCall(EventualCallKind.SendSignalCall, {
      payload,
      signalId,
      target,
      id,
      // /**
      //  * Send signal is modeled synchronously, but the {@link sendSignal} method
      //  * returns a promise. Ensure the SendSignalCall is always considered to be immediately resolved.
      //  */
      // result: Result.resolved(undefined),
    })
  );
}
