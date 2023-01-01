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
