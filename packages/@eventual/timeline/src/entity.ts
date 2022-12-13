import { HistoryStateEvent, WorkflowEvent } from "@eventual/core";

export type TimelineEntity = {
  rootEvent: WorkflowEvent;
  leafEvents: WorkflowEvent[];
};

/**
 * Start and end are expected to be in ms
 */
export interface Timespan {
  start: number;
  end: number;
}

export function historyToTimelineEntities(
  events: HistoryStateEvent[]
): TimelineEntity[] {
  const seqEntities: Record<number, TimelineEntity> = {};
  const standaloneEntities: TimelineEntity[] = [];
  events.forEach((event) => {
    if ("seq" in event) {
      //First time we encounter a given seq, we'll index it as a root event
      if (!seqEntities[event.seq]) {
        seqEntities[event.seq] = { rootEvent: event, leafEvents: [] };
      } else {
        seqEntities[event.seq]?.leafEvents.push(event);
      }
    } else {
      standaloneEntities.push({ rootEvent: event, leafEvents: [] });
    }
  });
  return Object.values(seqEntities).concat(standaloneEntities);
}
