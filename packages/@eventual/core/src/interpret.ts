import {
  Action,
  Activity,
  createThread,
  collectActivities,
  isAction,
  isActivity,
  isAwaitAll,
  isThread,
  resetActivityCollector,
  resetThreadIDCounter,
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
  resetActivityCollector();
  resetThreadIDCounter();
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

export type Program = Generator<Activity>;

/**
 * Interprets a workflow program
 */
export function interpret(
  program: Generator<any, any, Activity>,
  history: HistoryEvent[]
): WorkflowResult {
  reset();
  const actionTable: Record<number, Action> = {};
  const mainThread = createThread(program);
  const threadTable: Record<number, Thread> = {
    0: mainThread,
  };

  let seq = 0;
  function nextSeq() {
    return seq++;
  }

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
      commitCompletion(event, true);
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
    commitCompletion(event, false);
    actions.push(...run(false));
  }

  do {
    // continue progressing the program until all possible progress has been made
    actions.push(...run(false));
  } while (canMakeProgress());

  const result = resolveActivityResult(mainThread);

  return {
    result,
    actions,
  };

  function canMakeProgress() {
    return Object.values(threadTable).some((thread) =>
      isActivityComplete(thread)
    );
  }

  function isActivityComplete(activity: Activity): boolean {
    const result = activity.result;
    if (isResolved(result) || isFailed(result)) {
      return true;
    } else if (isThread(activity)) {
      if (activity.awaiting) {
        return isActivityComplete(activity.awaiting);
      } else {
        return false;
      }
    } else if (isAwaitAll(activity)) {
      return activity.activities.every(isActivityComplete);
    } else {
      return false;
    }
  }

  function resolveActivityResult(activity: Activity): Result | undefined {
    if (isAction(activity)) {
      return activity.result;
    } else if (isThread(activity)) {
      if (activity.result) {
        if (isPending(activity.result)) {
          return resolveActivityResult(activity.result.activity);
        } else {
          return activity.result;
        }
      } else {
        return undefined;
      }
    } else if (isAwaitAll(activity)) {
      const results = [];
      for (const dependentActivity of activity.activities) {
        const result = resolveActivityResult(dependentActivity);
        if (isFailed(result)) {
          return (activity.result = result);
        } else if (isResolved(result)) {
          results.push(result.value);
        } else {
          return undefined;
        }
      }
      return (activity.result = Result.resolved(results));
    } else {
      return assertNever(activity);
    }
  }

  function commitCompletion(
    event: ActivityCompleted | ActivityFailed,
    isReplay: boolean
  ) {
    const activity = getAction(event.seq);
    if (isReplay && activity.result && !isPending(activity.result)) {
      throw new DeterminismError();
    }
    activity.result = isActivityCompleted(event)
      ? Result.resolved(event.result)
      : Result.failed(event.error);
  }

  function run(replay: boolean): Action[] {
    const actions = Object.values(threadTable).flatMap((thread) =>
      tryMakeProgress(thread, replay)
    );
    actions.forEach((action) => {
      // assign action sequences in order of when they were spawned
      action.seq = nextSeq();
      actionTable[action.seq] = action;
    });
    return actions;
  }

  /**
   * Try and make progress in a thread if it can be woken up
   * with a new value.
   */
  function tryMakeProgress(thread: Thread, replay: boolean): Action[] {
    resetActivityCollector();
    if (thread.awaiting === undefined) {
      return wakeUpThread(thread, undefined);
    }
    const result = resolveActivityResult(thread.awaiting);
    if (result === undefined) {
      return [];
    } else if (isResolved(result) || isFailed(result)) {
      return wakeUpThread(thread, result);
    } else if (isAwaitAll(result.activity)) {
      const results = [];
      for (const activity of result.activity.activities) {
        const result = activity.result;
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
        return [];
      }
      const iterResult =
        result === undefined || isResolved(result)
          ? thread.program.next(result?.value)
          : thread.program.throw(result.error);

      if (iterResult.done) {
        delete threadTable[thread.id];
        delete thread.awaiting;
        if (isActivity(iterResult.value)) {
          thread.result = Result.pending(iterResult.value);
        } else {
          thread.result = Result.resolved(iterResult.value);
        }
      } else {
        thread.awaiting = iterResult.value;
      }

      const activities = collectActivities();

      activities
        .filter(isThread)
        .forEach((thread) => (threadTable[thread.id] = thread));

      return activities.flatMap((spawned) => {
        if (isAction(spawned)) {
          return [spawned];
        } else if (isThread(spawned)) {
          return tryMakeProgress(spawned, replay);
        } else {
          return [];
        }
      });
    }
  }

  function getAction(seq: number): Action {
    const action = actionTable[seq];
    if (action === undefined) {
      throw new DeterminismError();
    }
    return action;
  }
}

function isCorresponding(event: ActivityScheduled, action: Action) {
  return (
    event.seq === action.seq && event.name === action.name
    // TODO: also validate arguments
  );
}
