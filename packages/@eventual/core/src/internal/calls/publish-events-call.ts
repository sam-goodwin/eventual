import { EventEnvelope } from "../../event.js";
import { EventualPromise, getWorkflowHook } from "../eventual-hook.js";
import {
  createEventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isPublishEventsCall(a: any): a is PublishEventsCall {
  return isEventualCallOfKind(EventualCallKind.PublishEventsCall, a);
}

export interface PublishEventsCall
  extends EventualCallBase<EventualCallKind.PublishEventsCall> {
  events: EventEnvelope[];
  id?: string;
}

export function createPublishEventsCall(
  events: EventEnvelope[],
  id?: string
): EventualPromise<void> {
  return getWorkflowHook().registerEventualCall(
    createEventualCall(EventualCallKind.PublishEventsCall, {
      events,
      id,
      // /**
      //  * Publish Events is modeled synchronously, but the {@link sendEvents} method
      //  * returns a promise. Ensure the PublishEventsCall is always considered to be
      //  * immediately resolved.
      //  */
      // result: Result.resolved(undefined),
    })
  );
}
