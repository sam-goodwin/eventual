import {
  Action,
  Activity,
  createThread,
  collectActivities,
  isAction,
  isActivity,
  isAwaitAll,
  isThread,
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
  const actionTable: Record<number, Action> = {};
  const mainThread = createThread(program);
  const threadTable = new Set([mainThread]);

  let seq = 0;
  function nextSeq() {
    return seq++;
  }

  let historyIndex = 0;
  function peek() {
    return history[historyIndex];
  }
  function pop() {
    return history[historyIndex++]!;
  }
  function takeWhile<T>(max: number, guard: (a: any) => a is T): T[] {
    const items: T[] = [];
    while (items.length < max && guard(peek())) {
      items.push(pop() as T);
    }
    return items;
  }
  function peekForward<T>(guard: (a: any) => a is T): boolean {
    for (let i = historyIndex; i < history.length; i++) {
      if (guard(history[i])) {
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
  // we do this because events come in chunks of Scheduled/Completed
  // [...scheduled, ...completed, ...scheduled]
  // if the history's tail contains completed events, e.g. [...scheduled, ...completed]
  // then we need to apply the completions, wake threads and schedule any produced actions
  while ((event = pop())) {
    if (isActivityScheduled(event)) {
      // it should be impossible to receive a scheduled event
      // -> because the tail of history can only contain completion events
      // -> scheduled events stored in history should correspond to actions
      //    -> or else a determinism error would have been thrown
      throw new Error("illegal state");
    }
    commitCompletion(event, false);
    actions.push(...run(false));
  }

  do {
    // continue progressing the program until all possible progress has been made
    actions.push(...run(false));
  } while (canMakeProgress());

  const result = tryResolveResult(mainThread);

  return {
    result,
    actions,
  };

  function canMakeProgress() {
    return Array.from(threadTable).some((thread) => isCompleted(thread));
  }

  function run(replay: boolean): Action[] {
    const actions = Array.from(threadTable).flatMap((thread) =>
      runIfAwake(thread, replay)
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
  function runIfAwake(thread: Thread, replay: boolean): Action[] {
    if (thread.awaiting === undefined) {
      return wakeThread(thread, undefined);
    }
    const result = tryResolveResult(thread.awaiting);
    if (result === undefined) {
      return [];
    } else if (isResolved(result) || isFailed(result)) {
      return wakeThread(thread, result);
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
          return wakeThread(thread, result);
        } else {
          results.push(result.value);
        }
      }
      return wakeThread(thread, Result.resolved(results));
    } else {
      return [];
    }

    /**
     * Wakes up a thread with a new value and return any newly spawned Actions.
     */
    function wakeThread(
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
        threadTable.delete(thread);
        if (isActivity(iterResult.value)) {
          thread.result = Result.pending(iterResult.value);
        } else {
          thread.result = Result.resolved(iterResult.value);
        }
      } else {
        thread.awaiting = iterResult.value;
      }

      const activities = collectActivities();
      activities.filter(isThread).forEach((thread) => threadTable.add(thread));

      return activities.flatMap((spawned) => {
        if (isAction(spawned)) {
          return [spawned];
        } else if (isThread(spawned)) {
          return runIfAwake(spawned, replay);
        } else {
          return [];
        }
      });
    }
  }

  function isCompleted(activity: Activity): boolean {
    const result = activity.result;
    if (isResolved(result) || isFailed(result)) {
      return true;
    } else if (isThread(activity)) {
      if (activity.awaiting) {
        return isCompleted(activity.awaiting);
      } else {
        return false;
      }
    } else if (isAwaitAll(activity)) {
      return activity.activities.every(isCompleted);
    } else {
      return false;
    }
  }

  function tryResolveResult(activity: Activity): Result | undefined {
    if (isAction(activity)) {
      return activity.result;
    } else if (isThread(activity)) {
      if (activity.result) {
        if (isPending(activity.result)) {
          return tryResolveResult(activity.result.activity);
        } else {
          return activity.result;
        }
      } else {
        return undefined;
      }
    } else if (isAwaitAll(activity)) {
      const results = [];
      for (const dependentActivity of activity.activities) {
        const result = tryResolveResult(dependentActivity);
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
    const action = actionTable[event.seq];
    if (action === undefined) {
      throw new DeterminismError();
    }
    if (isReplay && action.result && !isPending(action.result)) {
      throw new DeterminismError();
    }
    action.result = isActivityCompleted(event)
      ? Result.resolved(event.result)
      : Result.failed(event.error);
  }
}

function isCorresponding(event: ActivityScheduled, action: Action) {
  return (
    event.seq === action.seq && event.name === action.name
    // TODO: also validate arguments
  );
}
