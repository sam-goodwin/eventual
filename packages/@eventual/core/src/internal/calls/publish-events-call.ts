import { EventEnvelope } from "../../event.js";
import {
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
