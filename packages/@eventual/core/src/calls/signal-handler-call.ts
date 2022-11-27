import {
  EventualBase,
  EventualKind,
  EventualSymbol,
  isEventual,
} from "../eventual.js";
import { SignalsHandler } from "../signals.js";
import { registerActivity } from "../global.js";
import { Program } from "../interpret.js";
import { Resolved, Result } from "../result.js";

export function isRegisterSignalHandlerCall(
  a: any
): a is RegisterSignalHandlerCall {
  return (
    isEventual(a) &&
    a[EventualSymbol] === EventualKind.RegisterSignalHandlerCall
  );
}

export interface RegisterSignalHandlerCall<T = any>
  extends EventualBase<Resolved>,
    SignalsHandler {
  [EventualSymbol]: EventualKind.RegisterSignalHandlerCall;
  seq?: number;
  signalId: string;
  handler: (input: T) => Program | void;
}

export function createRegisterSignalHandlerCall(
  signalId: string,
  handler: RegisterSignalHandlerCall["handler"]
): RegisterSignalHandlerCall {
  return registerActivity<RegisterSignalHandlerCall>({
    [EventualSymbol]: EventualKind.RegisterSignalHandlerCall,
    signalId: signalId,
    handler,
    dispose: function () {
      this.result = Result.resolved(undefined);
    },
  });
}
