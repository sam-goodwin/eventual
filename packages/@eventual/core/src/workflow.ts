import {
  Action,
  Activity,
  createThread,
  getSpawnedActivities,
  isAction,
  isActivity,
  isAwaitAll,
  isThread,
  resetActivities,
  resetActivityIDCounter,
  scheduleThread,
  Thread,
} from "./activity";
import { DeterminismError } from "./error";
import {
  ActivityCompleted,
  ActivityFailed,
  ActivityScheduled,
  isActivityCompleted,
  isActivityFailed,
  isActivityScheduled,
  isWorkflowStarted,
  WorkflowEvent,
  WorkflowEventType,
} from "./events";
import {
  Result,
  isResolved,
  isFailed,
  isPending,
  Failed,
  ResultKind,
} from "./result";
import { assertNever, not, or } from "./util";

function reset() {
  resetActivities();
  resetActivityIDCounter();
}

export interface WorkflowResult {
  /**
   * The Result if this workflow has terminated.
   */
  result?: Result;
  /**
   * Any Actions that need to be scheduled.
   *
   * This can still be non-empty even if the workflow has terminated because of dangling promises.
   */
  actions: Action[];
}

export type HistoryEvent =
  | ActivityScheduled
  | ActivityCompleted
  | ActivityFailed;

export function executeWorkflow(
  generator: Generator<any, any, Activity>,
  history: HistoryEvent[]
): WorkflowResult {
  reset();
  const threads: Thread[] = [createThread(generator)];
  const results: Record<number, Result> = {};

  let i = 0;
  function peek() {
    return history[i];
  }
  function pop() {
    if (i < history.length) {
      return history[i++]!;
    } else {
      throw new Error(`stack underflow`);
    }
  }

  while (peek()) {
    const event = pop();
    if (isActivityCompleted(event) || isActivityFailed(event)) {
      replay(event);
    } else if (isActivityScheduled(event)) {
      const actions = run(true);
      const scheduledEvents = [event, ...takeWhile(isActivityScheduled)];

      if (actions.length !== scheduledEvents.length) {
        // there should be one action for each scheduled event in history
        throw new DeterminismError();
      }
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i]!;
        const event = scheduledEvents[i]!;

        if (!isCorresponding(event, action)) {
          throw new DeterminismError();
        }
      }
    }
  }

  const actions = run(false);

  return {
    actions,
  };

  /**
   * Replay the {@link events} to the program
   */
  function replay(event: ActivityCompleted | ActivityFailed): void {
    const result = getResult(event.seq);

    if (result === undefined || !isPending(result)) {
      throw new DeterminismError();
    }

    results[event.seq] = isActivityCompleted(event)
      ? Result.resolved(event.result)
      : Result.failed(event.error);
  }

  function run(replay: boolean): Action[] {
    return threads.flatMap((thread) => step(thread, replay));
  }

  function step(thread: Thread, replay: boolean): Action[] {
    resetActivities();
    if (thread.awaiting === undefined) {
      propagate(thread, thread.generator.next());
    } else {
      const result = getResult(thread.awaiting.seq);
      if (result === undefined) {
        if (replay) {
          throw new DeterminismError();
        }
      } else if (isResolved(result)) {
        propagate(thread, thread.generator.next(result.value));
      } else if (isFailed(result)) {
        propagate(thread, thread.generator.throw(result.error));
      } else if (isAwaitAll(thread.awaiting)) {
        const results = [];
        for (const activity of thread.awaiting.activities) {
          const result = getResult(activity.seq);
          if (result === undefined) {
          } else if (isPending(result)) {
            break;
          } else if (isFailed(result)) {
            results[thread.awaiting.seq] = result;
            propagate(thread, thread.generator.throw(result.error));
          } else {
            results.push(result);
          }
        }
        propagate(thread, thread.generator.next(results));
      }
    }

    const spawned = getSpawnedActivities();
    return [
      ...spawned.filter(isAction),
      ...spawned.filter(isThread).flatMap((thread) => step(thread, replay)),
    ];
  }

  function propagate(thread: Thread, result: IteratorResult<Activity>): void {
    if (result.done) {
      results[thread.seq] = Result.resolved(result.value);
    } else {
      results[result.value.seq] = Result.pending();
      thread.awaiting = result.value;
    }
  }

  function getResult(seq: number): Result | undefined {
    return results[seq];
  }

  function takeWhile<T>(guard: (item: any) => item is T): T[] {
    const items: T[] = [];
    while (guard(peek())) {
      items.push(pop() as any);
    }
    return items;
  }
}

function isCorresponding(event: ActivityScheduled, action: Action) {
  return (
    event.seq === action.seq && event.name === action.name
    // TODO: also validate arguments
  );
}
