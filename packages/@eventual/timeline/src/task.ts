import {
  HistoryStateEvent,
  WorkflowStarted,
  isTaskFailed,
  isTaskScheduled,
  isTaskSucceeded,
  isWorkflowStarted,
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

export type TaskState = Succeeded | Failed | InProgress;

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

export function isCompleted(state: TaskState): state is Succeeded {
  return state.status === "succeeded";
}

export function isFailed(state: TaskState): state is Failed {
  return state.status === "failed";
}

export interface TimelineTask {
  type: "task";
  seq: number;
  name: string;
  start: number;
  state: TaskState;
}

export function endTime(task: TimelineTask): number | undefined {
  const { state } = task;
  return isCompleted(state) || isFailed(state) ? state.end : undefined;
}

export function aggregateEvents(events: HistoryStateEvent[]): {
  start: WorkflowStarted;
  tasks: TimelineTask[];
} {
  let start: WorkflowStarted | undefined;
  const tasks: Record<number, TimelineTask> = [];
  events.forEach((event) => {
    if (isWorkflowStarted(event)) {
      start = event;
    } else if (isTaskScheduled(event)) {
      tasks[event.seq] = {
        type: "task",
        name: event.name,
        seq: event.seq,
        start: new Date(event.timestamp).getTime(),
        state: { status: "inprogress" },
      };
    } else if (isTaskSucceeded(event)) {
      const existingTask = tasks[event.seq];
      if (existingTask) {
        existingTask.state = {
          status: "succeeded",
          end: new Date(event.timestamp).getTime(),
        };
      } else {
        console.log(
          `Warning: Found completion event without matching scheduled event: ${event}`
        );
      }
    } else if (isTaskFailed(event)) {
      const existingTask = tasks[event.seq];
      if (existingTask) {
        existingTask.state = {
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
  return { start, tasks: Object.values(tasks) };
}
