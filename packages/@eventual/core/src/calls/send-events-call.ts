import {
  isEventual,
  EventualSymbol,
  EventualKind,
  EventualBase,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { EventEnvelope } from "../event.js";
import { Resolved, Result } from "../result.js";

export function isPublishEventsCall(a: any): a is PublishEventsCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.PublishEventsCall;
}

export interface PublishEventsCall extends EventualBase<Resolved<void>> {
  [EventualSymbol]: EventualKind.PublishEventsCall;
  seq?: number;
  events: EventEnvelope[];
  id?: string;
}

export function createPublishEventsCall(
  events: EventEnvelope[],
  id?: string
): PublishEventsCall {
  return registerEventual<PublishEventsCall>({
    [EventualSymbol]: EventualKind.PublishEventsCall,
    events,
    id,
    /**
     * Publish Events is modeled synchronously, but the {@link sendEvents} method
     * returns a promise. Ensure the PublishEventsCall is always considered to be
     * immediately resolved.
     */
    result: Result.resolved(undefined),
  });
}
