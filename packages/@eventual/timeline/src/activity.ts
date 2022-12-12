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

export interface Timespan {
  start: number;
  end: number;
  duration: number;
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
