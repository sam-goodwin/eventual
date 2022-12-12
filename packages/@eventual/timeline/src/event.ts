import {
  HistoryStateEvent,
  isWorkflowStarted,
  WorkflowEventType,
} from "@eventual/core";

export type TimelinePointEventType =
  | WorkflowEventType.ExpectSignalStarted
  | WorkflowEventType.ExpectSignalTimedOut
  | WorkflowEventType.SignalReceived
  | WorkflowEventType.ConditionStarted
  | WorkflowEventType.ConditionTimedOut;

export type TimelineSpanEventType = "child-workflow" | "activity" | "sleep";

export type TimelineEvent =
  | { span: TimelineSpanEvent }
  | { point: TimelinePointEvent };

export interface TimelineSpanningEvent {
  type: TimelineSpanningEventType;
  seq: number;
  name: string;
  start: number;
  state: TimelineSpanningEventState;
}

export interface TimelinePointEvent {
  type: TimelinePointEventType;
}

export interface Completed {
  status: "completed";
  duration: number;
}

export interface Failed {
  status: "failed";
  duration: number;
}

export interface InProgress {
  status: "inprogress";
}

export type TimelineSpanningEventState = Completed | Failed | InProgress;

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

export function isCompleted(
  state: TimelineSpanningEventState
): state is Completed {
  return state.status == "completed";
}

export function isFailed(state: TimelineSpanningEventState): state is Failed {
  return state.status == "failed";
}

export function endTime(
  activity: TimelineSpanningEventState
): number | undefined {
  let { state } = activity;
  return isCompleted(state)
    ? activity.start + state.duration
    : isFailed(state)
    ? activity.start + state.duration
    : undefined;
}

export function historyToTimelineEvents(
  events: HistoryStateEvent[]
): TimelineEvent[] {
  const pointEvents: TimelinePointEvent[] = [];
  const spanningEvents: Record<number, TimelineSpanningEvent> = [];
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
    } else if (isActivityCompleted(event)) {
      let existingActivity = activities[event.seq];
      if (existingActivity) {
        existingActivity.state = {
          status: "completed",
          duration: event.duration,
        };
      } else {
        console.log(
          `Warning: Found completion event without matching scheduled event: ${event}`
        );
      }
    } else if (isActivityFailed(event)) {
      let existingActivity = activities[event.seq];
      if (existingActivity) {
        existingActivity.state = {
          status: "failed",
          duration: event.duration,
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
