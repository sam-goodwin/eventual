import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isRegisterSignalHandlerCall(
  a: any
): a is RegisterSignalHandlerCall {
  return isEventualCallOfKind(EventualCallKind.RegisterSignalHandlerCall, a);
}

export interface RegisterSignalHandlerCall<T = any>
  extends EventualCallBase<EventualCallKind.RegisterSignalHandlerCall> {
  signalId: string;
  handler: (input: T) => void;
}
