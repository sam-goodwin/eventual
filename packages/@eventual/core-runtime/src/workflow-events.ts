import {
  getEventId,
  isHistoryEvent,
  isSignalReceived,
  isWorkflowRunStarted,
  isWorkflowTimedOut,
  WorkflowEvent,
} from "@eventual/core/internal";
import { ulid } from "ulidx";

type UnresolvedEvent<T extends WorkflowEvent> = Omit<T, "id" | "timestamp">;

export function createEvent<T extends WorkflowEvent>(
  event: UnresolvedEvent<T>,
  time: Date,
  id: string = ulid()
): T {
  const timestamp = time.toISOString();

  // history events do not have IDs, use getEventId
  if (
    isHistoryEvent(event as unknown as WorkflowEvent) &&
    !isSignalReceived(event as unknown as WorkflowEvent) &&
    !isWorkflowRunStarted(event as unknown as WorkflowEvent) &&
    !isWorkflowTimedOut(event as unknown as WorkflowEvent)
  ) {
    return { ...(event as any), timestamp };
  }

  return { ...event, id, timestamp } as T;
}

/**
 * Filters out events that are also present in origin events.
 *
 * Events are taken only if their ID ({@link getEventId}) is unique across all other events.
 */
export function filterEvents<T extends WorkflowEvent>(
  originEvents: T[],
  events: T[]
): T[] {
  const ids = new Set(originEvents.map(getEventId));

  return events.filter((event) => {
    const id = getEventId(event);
    if (ids.has(id)) {
      return false;
    }
    ids.add(id);
    return true;
  });
}
