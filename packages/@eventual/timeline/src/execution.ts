import {
  isWorkflowCompleted,
  isWorkflowFailed,
  isWorkflowStarted,
  WorkflowCompleted,
  WorkflowFailed,
  WorkflowStarted,
} from "@eventual/core";
import { TimelineEntity } from "./entity.js";

export interface ExecutionProperties {
  start: Date;
  input: any;
  state: ExecutionState;
  //Latest timestamp of anything
  latest: Date;
}

export type ExecutionState = InProgressState | CompleteState | FailedState;

export interface InProgressState {
  type: "inProgress";
  duration: number;
}

export interface CompleteState {
  type: "complete";
  end: Date;
}

export interface FailedState {
  type: "failed";
  end: Date;
  error: string;
}

export function getExecutionProperties(
  entities: TimelineEntity[]
): ExecutionProperties | undefined {
  const { start, completed, failed, latest } = entities.reduce(
    (state, { rootEvent, leafEvents }) => {
      const latest = Math.max(
        state.latest,
        new Date(rootEvent.timestamp).getTime(),
        ...leafEvents.map((ev) => new Date(ev.timestamp).getTime())
      );
      if (isWorkflowStarted(rootEvent)) {
        return { ...state, latest, start: rootEvent };
      } else if (isWorkflowCompleted(rootEvent)) {
        return { ...state, latest, completed: rootEvent };
      } else if (isWorkflowFailed(rootEvent)) {
        return { ...state, latest, failed: rootEvent };
      } else {
        return state;
      }
    },
    {
      start: <WorkflowStarted | undefined>undefined,
      completed: <WorkflowCompleted | undefined>undefined,
      failed: <WorkflowFailed | undefined>undefined,
      latest: 0,
    }
  );
  if (start) {
    const startDate = new Date(start.timestamp);
    return {
      start: startDate,
      input: start.input,
      state: completed
        ? { type: "complete", end: new Date(completed.timestamp) }
        : failed
        ? {
            type: "failed",
            end: new Date(failed.timestamp),
            error: failed.error,
          }
        : { type: "inProgress", duration: latest - startDate.getTime() },
      latest: new Date(latest),
    };
  }
  return undefined;
}

export function endTime({ state }: ExecutionProperties) {
  switch (state.type) {
    case "complete":
      return state.end;
    case "failed":
      return state.end;
    default:
      return undefined;
  }
}
