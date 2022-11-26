import {
  EventualBase,
  EventualKind,
  EventualSymbol,
  isEventual,
} from "../eventual.js";
import { EventHandler } from "../external-event.js";
import { registerActivity } from "../global.js";
import { Program } from "../interpret.js";
import { Resolved, Result } from "../result.js";

export function isRegisterEventHandlerCall(
  a: any
): a is RegisterEventHandlerCall {
  return (
    isEventual(a) && a[EventualSymbol] === EventualKind.RegisterEventHandlerCall
  );
}

export interface RegisterEventHandlerCall<T = any>
  extends EventualBase<Resolved>,
    EventHandler {
  [EventualSymbol]: EventualKind.RegisterEventHandlerCall;
  seq?: number;
  eventId: string;
  handler: (input: T) => Program | void;
}

export function createRegisterEventHandlerCall(
  eventId: string,
  handler: RegisterEventHandlerCall["handler"]
): RegisterEventHandlerCall {
  return registerActivity<RegisterEventHandlerCall>({
    [EventualSymbol]: EventualKind.RegisterEventHandlerCall,
    eventId,
    handler,
    dispose: function () {
      this.result = Result.resolved(undefined);
    },
  });
}
