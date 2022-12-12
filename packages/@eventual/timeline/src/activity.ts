export interface TimelineActivity {
  type: "activity";
  seq: number;
  name: string;
  start: number;
  state: ActivityState;
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

export type ActivityState = Completed | Failed | InProgress;

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

export function isCompleted(state: ActivityState): state is Completed {
  return state.status == "completed";
}

export function isFailed(state: ActivityState): state is Failed {
  return state.status == "failed";
}

export function endTime(activity: TimelineActivity): number | undefined {
  let { state } = activity;
  return isCompleted(state)
    ? activity.start + state.duration
    : isFailed(state)
    ? activity.start + state.duration
    : undefined;
}
