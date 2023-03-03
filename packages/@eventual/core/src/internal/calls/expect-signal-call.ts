import { EventualPromise, getWorkflowHook } from "../eventual-hook.js";
import {
  createEventualCall,
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

export function createExpectSignalCall<T = any>(
  signalId: string,
  timeout?: Promise<any>
): EventualPromise<T> {
  return getWorkflowHook().registerEventualCall(
    createEventualCall(EventualCallKind.ExpectSignalCall, {
      timeout,
      signalId,
    })
  );
}
