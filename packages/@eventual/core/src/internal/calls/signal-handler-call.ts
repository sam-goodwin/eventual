import { SignalsHandler } from "../../signals.js";
import {
  EventualPromise,
  EventualPromiseSymbol,
  getWorkflowHook,
} from "../eventual-hook.js";
import { Result } from "../result.js";
import {
  createEventualCall,
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

export function createRegisterSignalHandlerCall(
  signalId: string,
  handler: RegisterSignalHandlerCall["handler"]
): SignalsHandler {
  const hook = getWorkflowHook();
  const eventualPromise = hook.registerEventualCall(
    createEventualCall(EventualCallKind.RegisterSignalHandlerCall, {
      signalId,
      handler,
    })
  ) as EventualPromise<void> & SignalsHandler;
  // the signal handler call should not block
  return {
    dispose: function () {
      // resolving the signal handler eventual makes it unable to accept new events.
      hook.resolveEventual(
        eventualPromise[EventualPromiseSymbol],
        Result.resolved(undefined)
      );
    },
  };
}
