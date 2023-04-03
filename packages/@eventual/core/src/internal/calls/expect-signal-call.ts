import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isExpectSignalCall(a: any): a is ExpectSignalCall {
  return isEventualCallOfKind(EventualCallKind.ExpectSignalCall, a);
}

export interface ExpectSignalCall
  extends EventualCallBase<EventualCallKind.ExpectSignalCall> {
  signalId: string;
  timeout?: Promise<any>;
}
