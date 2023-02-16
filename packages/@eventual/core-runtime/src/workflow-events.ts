import {
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
