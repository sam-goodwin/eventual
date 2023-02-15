import {
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { EventEnvelope } from "../../event.js";
import { Resolved, Result } from "../result.js";

export function isPublishEventsCall(a: any): a is PublishEventsCall {
  return isEventualOfKind(EventualKind.PublishEventsCall, a);
}

export interface PublishEventsCall
  extends EventualBase<EventualKind.PublishEventsCall, Resolved<void>> {
  seq?: number;
  events: EventEnvelope[];
  id?: string;
}

export function createPublishEventsCall(
  events: EventEnvelope[],
  id?: string
): PublishEventsCall {
  return registerEventual<PublishEventsCall>(
    createEventual(EventualKind.PublishEventsCall, {
      events,
      id,
      /**
       * Publish Events is modeled synchronously, but the {@link sendEvents} method
       * returns a promise. Ensure the PublishEventsCall is always considered to be
       * immediately resolved.
       */
      result: Result.resolved(undefined),
    })
  );
}
