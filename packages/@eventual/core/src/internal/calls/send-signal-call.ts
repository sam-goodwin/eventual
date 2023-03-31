import { SignalTarget } from "../signal.js";
import {
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
