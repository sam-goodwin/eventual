import {
  isEventual,
  EventualSymbol,
  EventualKind,
  EventualBase,
} from "../eventual.js";
import { registerActivity } from "../global.js";
import { Resolved } from "../result.js";

export function isWaitForEventCall(a: any): a is WaitForEventCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.WaitForEventCall;
}

export interface WaitForEventCall<T = any> extends EventualBase<Resolved<T>> {
  [EventualSymbol]: EventualKind.WaitForEventCall;
  seq?: number;
  eventId: string;
  timeoutSeconds?: number;
}

export function createWaitForEventCall(
  eventId: string,
  timeoutSeconds?: number
): WaitForEventCall {
  return registerActivity<WaitForEventCall>({
    [EventualSymbol]: EventualKind.WaitForEventCall,
    timeoutSeconds,
    eventId,
  });
}
