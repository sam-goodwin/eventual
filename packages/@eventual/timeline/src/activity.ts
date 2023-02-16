import {
  HistoryStateEvent,
  WorkflowStarted,
  isWorkflowStarted,
  isActivityScheduled,
  isActivitySucceeded,
  isActivityFailed,
} from "@eventual/core/internal";

export interface Succeeded {
  status: "succeeded";
  end: number;
}

export interface Failed {
  status: "failed";
  end: number;
}

export interface InProgress {
  status: "inprogress";
}

export type ActivityState = Succeeded | Failed | InProgress;

/**
 * Start and end are expected to be in ms
 */
export interface Timespan {
  start: number;
  end: number;
}

/**
 * Return ms between start and end of a timespan
 * @param span The timespan to measure, with start and end in ms
 * @returns Duration, in ms
 */
export function getDuration({ start, end }: Timespan): number {
  return end - start;
}

export function isCompleted(state: ActivityState): state is Succeeded {
  return state.status === "succeeded";
}

export function isFailed(state: ActivityState): state is Failed {
  return state.status === "failed";
}

export interface TimelineActivity {
  type: "activity";
  seq: number;
  name: string;
  start: number;
  state: ActivityState;
}

export function endTime(activity: TimelineActivity): number | undefined {
  const { state } = activity;
  return isCompleted(state) || isFailed(state) ? state.end : undefined;
}

export function aggregateEvents(events: HistoryStateEvent[]): {
  start: WorkflowStarted;
  activities: TimelineActivity[];
} {
  let start: WorkflowStarted | undefined;
  const activities: Record<number, TimelineActivity> = [];
  events.forEach((event) => {
    if (isWorkflowStarted(event)) {
      start = event;
    } else if (isActivityScheduled(event)) {
      activities[event.seq] = {
        type: "activity",
        name: event.name,
        seq: event.seq,
        start: new Date(event.timestamp).getTime(),
        state: { status: "inprogress" },
      };
    } else if (isActivitySucceeded(event)) {
      const existingActivity = activities[event.seq];
      if (existingActivity) {
        existingActivity.state = {
          status: "succeeded",
          end: new Date(event.timestamp).getTime(),
        };
      } else {
        console.log(
          `Warning: Found completion event without matching scheduled event: ${event}`
        );
      }
    } else if (isActivityFailed(event)) {
      const existingActivity = activities[event.seq];
      if (existingActivity) {
        existingActivity.state = {
          status: "failed",
          end: new Date(event.timestamp).getTime(),
        };
      } else {
        console.log(
          `Warning: Found failure event without matching scheduled event: ${event}`
        );
      }
    }
  });
  if (!start) {
    throw new Error("Failed to find WorkflowStarted event!");
  }
  return { start, activities: Object.values(activities) };
}
