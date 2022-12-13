import {
  CommandCallBase,
  createEventual,
  EventualKind,
  isEventualOfKind,
} from "../eventual.js";
import { SignalsHandler } from "../signals.js";
import { registerEventual } from "../global.js";
import { Program } from "../interpret.js";
import { Resolved, Result } from "../result.js";

export function isRegisterSignalHandlerCall(
  a: any
): a is RegisterSignalHandlerCall {
  return isEventualOfKind(EventualKind.RegisterSignalHandlerCall, a);
}

export interface RegisterSignalHandlerCall<T = any>
  extends CommandCallBase<EventualKind.RegisterSignalHandlerCall, Resolved>,
    SignalsHandler {
  signalId: string;
  handler: (input: T) => Program | void;
}

export function createRegisterSignalHandlerCall(
  signalId: string,
  handler: RegisterSignalHandlerCall["handler"]
): RegisterSignalHandlerCall {
  return registerEventual(
    createEventual(EventualKind.RegisterSignalHandlerCall, {
      signalId: signalId,
      handler,
      dispose: function () {
        this.result = Result.resolved(undefined);
      },
    })
  );
}
