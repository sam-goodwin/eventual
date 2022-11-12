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
} from "./events";
import { Result, isResolved, isFailed, isPending } from "./result";
import { assertNever } from "./util";

function reset() {
  resetActivities();
  resetActivityIDCounter();
}

export interface WorkflowResult {
  /**
   * The Result if this thread has terminated.
   */
  result?: Result;
  /**
   * Any Actions that need to be scheduled.
   *
   * This can still be non-empty even if the thread has terminated because of dangling promises.
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
  const threads: Record<number, Thread> = {
    0: createThread(generator),
  };
  const results: Record<number, Result> = {};

  let i = 0;
  function peek() {
    return history[i];
  }
  function pop() {
    return history[i++]!;
  }
  function takeWhile<T>(max: number, guard: (a: any) => a is T): T[] {
    const items: T[] = [];
    while (items.length < max && guard(peek())) {
      items.push(pop() as T);
    }
    return items;
  }
  function peekForward<T>(guard: (a: any) => a is T): boolean {
    for (let j = i; j < history.length; j++) {
      if (guard(history[j])) {
        return true;
      }
    }
    return false;
  }

  let event;
  // run the event loop one event at a time, ensuring deterministic execution.
  while ((event = peek()) && peekForward(isActivityScheduled)) {
    pop();

    if (isActivityCompleted(event) || isActivityFailed(event)) {
      complete(event, true);
    } else if (isActivityScheduled(event)) {
      const actions = run(true);
      const events = [
        event,
        ...takeWhile(actions.length - 1, isActivityScheduled),
      ];
      if (events.length !== actions.length) {
        throw new DeterminismError();
      }
      for (let i = 0; i < actions.length; i++) {
        const event = events[i]!;
        const action = actions[i]!;

        if (!isCorresponding(event, action)) {
          throw new DeterminismError();
        }
      }
    }
  }

  const actions = [];

  // run out the remaining completion events and collect any scheduled actions
  while ((event = pop())) {
    if (isActivityScheduled(event)) {
      throw new Error("illegal state");
    }
    complete(event, false);
    actions.push(...run(false));
  }

  let result;
  do {
    // continue progressing the program until all possible progress has been made
    actions.push(...run(false));
    result = results[0];
  } while (canMakeProgress());

  if (isPending(result) && isReady(result.activity)) {
    result = resolveActivityResult(result.activity);
  }

  return {
    result,
    actions,
  };

  function canMakeProgress() {
    return Object.values(threads).some(
      (thread) => thread.awaiting === undefined || isReady(thread.awaiting)
    );
  }

  function isReady(activity: Activity): boolean {
    const result = getResult(activity.seq);
    if (isResolved(result) || isFailed(result)) {
      return true;
    } else if (isAwaitAll(activity)) {
      return activity.activities.every(isReady);
    } else {
      return false;
    }
  }

  function resolveActivityResult(activity: Activity): Result<any> {
    if (isAction(activity) || isThread(activity)) {
      return results[activity.seq]!;
    } else if (isAwaitAll(activity)) {
      const results = [];
      for (const a of activity.activities) {
        const result = resolveActivityResult(a);
        if (isFailed(result)) {
          return result;
        } else if (isResolved(result)) {
          results.push(result.value);
        } else {
          throw new Error(`failed to resolve`);
        }
      }
      return Result.resolved(results);
    } else {
      return assertNever(activity);
    }
  }

  function complete(
    event: ActivityCompleted | ActivityFailed,
    isReplay: boolean
  ) {
    const result = getResult(event.seq);
    if (result === undefined || (isReplay && !isPending(result))) {
      throw new DeterminismError();
    }
    results[event.seq] = isActivityCompleted(event)
      ? Result.resolved(event.result)
      : Result.failed(event.error);
  }

  function run(replay: boolean): Action[] {
    return Object.values(threads).flatMap((thread) =>
      tryMakeProgress(thread, replay)
    );
  }

  /**
   * Try and make progress in a thread if it can be woken up
   * with a new value.
   */
  function tryMakeProgress(thread: Thread, replay: boolean): Action[] {
    resetActivities();
    if (thread.awaiting === undefined) {
      return wakeUpThread(thread, undefined);
    }
    const result = getResult(thread.awaiting.seq);
    if (isPending(result)) {
      if (isReady(result.activity)) {
        return wakeUpThread(thread, resolveActivityResult(result.activity));
      } else {
        return [];
      }
    } else if (isResolved(result) || isFailed(result)) {
      return wakeUpThread(thread, result);
    } else if (isAwaitAll(thread.awaiting)) {
      const results = [];
      for (const activity of thread.awaiting.activities) {
        const result = getResult(activity.seq);
        if (result === undefined) {
          // something went wrong, we should always have a Pending Result for an Activity
          // TODO: this may be an internal IllegalStateException, not a DeterminismError
          //       -> this state should not be possible to get into, even when writing non-deterministic code
          throw new DeterminismError();
        } else if (isPending(result)) {
          // thread cannot wake up because we're waiting on all tasks
          return [];
        } else if (isFailed(result)) {
          // one of the inner activities has failed, the thread should throw
          return wakeUpThread(thread, result);
        } else {
          results.push(result.value);
        }
      }
      return wakeUpThread(thread, Result.resolved(results));
    } else {
      return [];
    }

    /**
     * Wakes up a thread with a new value and return any newly spawned Actions.
     */
    function wakeUpThread(
      thread: Thread,
      result: Result<any> | undefined
    ): Action[] {
      if (result && isPending(result)) {
        results[thread.seq] = result;
        return [];
      }
      const iterResult =
        result === undefined || isResolved(result)
          ? thread.generator.next(result?.value)
          : thread.generator.throw(result.error);

      if (iterResult.done) {
        delete threads[thread.seq];
        if (isActivity(iterResult.value)) {
          results[thread.seq] = Result.pending(iterResult.value);
        } else {
          results[thread.seq] = Result.resolved(iterResult.value);
        }
      } else {
        thread.awaiting = iterResult.value;
        results[iterResult.value.seq] = Result.pending(iterResult.value);
      }

      const spawned = getSpawnedActivities();
      const actions = spawned.filter(isAction);
      const newThreads = spawned.filter(isThread);
      actions.forEach(
        (action) => (results[action.seq] = Result.pending(action))
      );
      newThreads.forEach((thread) => (threads[thread.seq] = thread));

      return [
        ...actions,
        ...newThreads.flatMap((thread) => tryMakeProgress(thread, replay)),
      ];
    }
  }

  function getResult(seq: number): Result | undefined {
    return results[seq];
  }
}

function isCorresponding(event: ActivityScheduled, action: Action) {
  return (
    event.seq === action.seq && event.name === action.name
    // TODO: also validate arguments
  );
}
