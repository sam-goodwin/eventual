import { createFailed, createPending, createResolved, Result } from "./result";
import {
  Event,
  isActivityCompletedEvent,
  isActivityFailedEvent,
  isActivityScheduledEvent,
  isAwaitableEvent,
} from "./events";

export interface State {
  threads: Result[][];
}

/**
 * Temporary function that digest events to state.
 */
export function mergeEventsIntoState(events: Event[], state?: State): State {
  const awaitableEvents = events.filter(isAwaitableEvent);

  if (!state && awaitableEvents.length === 0) {
    return { threads: [] };
  }

  const maxThread = Math.max(
    state?.threads.length ?? 0,
    ...awaitableEvents.map((e) => e.threadId)
  );

  return {
    threads: [...Array(maxThread + 1).keys()].map((threadId) => {
      const threadSeq = state?.threads[threadId] ?? [];

      const threadSeqEvents = awaitableEvents.filter(
        (e) => e.threadId === threadId
      );

      const maxSeq = Math.max(...threadSeqEvents.map((e) => e.seq));

      return [...Array(maxSeq + 1).keys()].map((seqIndex) => {
        const prevResult = threadSeq[seqIndex];

        const seqEvents = threadSeqEvents.filter((e) => e.seq === seqIndex);

        const failureEvent = seqEvents.find(isActivityFailedEvent);

        if (failureEvent) {
          return createFailed(failureEvent.error);
        }

        const completeEvent = seqEvents.find(isActivityCompletedEvent);

        if (completeEvent) {
          return createResolved(completeEvent.result);
        }

        const scheduledEvent = seqEvents.find(isActivityScheduledEvent);

        if (scheduledEvent) {
          return createPending();
        } else if (prevResult) {
          return prevResult;
        } else {
          // no previous results and no events for this awaitable.
          throw new Error(
            `Invalid workflow state, awaitable: ${threadId}-${seqIndex} has no events.`
          );
        }
      });
    }),
  };
}
