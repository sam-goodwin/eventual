import { SignalsHandler } from "../../signals.js";
import {
  createEventual,
  EventualBase,
  EventualKind,
  isEventualOfKind,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Result } from "../result.js";

export function isRegisterSignalHandlerCall(
  a: any
): a is RegisterSignalHandlerCall {
  return isEventualOfKind(EventualKind.RegisterSignalHandlerCall, a);
}

export interface RegisterSignalHandlerCall<T = any>
  extends EventualBase<EventualKind.RegisterSignalHandlerCall, Resolved>,
    SignalsHandler {
  seq?: number;
  signalId: string;
  handler: (input: T) => void;
}

export function createRegisterSignalHandlerCall(
  signalId: string,
  handler: RegisterSignalHandlerCall["handler"]
): RegisterSignalHandlerCall {
  return registerEventual(
    createEventual(EventualKind.RegisterSignalHandlerCall, {
      signalId,
      handler,
      dispose: function () {
        this.result = Result.resolved(undefined);
      },
    })
  );
}