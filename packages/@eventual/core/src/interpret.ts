import { Activity, isActivity } from "./activity";
import { isAwaitAll } from "./await-all";
import { Command, isCommand } from "./command";
import { DeterminismError } from "./error";
import {
  ActivityCompleted,
  ActivityFailed,
  ActivityScheduled,
  isActivityCompleted,
  isActivityFailed,
  isActivityScheduled,
} from "./events";
import { collectActivities } from "./global";
import { Result, isResolved, isFailed, isPending } from "./result";
import { createThread, isThread, Thread } from "./thread";
import { assertNever } from "./util";

export interface WorkflowResult {
  /**
   * The Result if this thread has terminated.
   */
  result?: Result;
  /**
   * Any Commands that need to be scheduled.
   *
   * This can still be non-empty even if the thread has terminated because of dangling promises.
   */
  commands: Command[];
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
  const commandTable: Record<number, Command> = {};
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
      commitCompletionEvent(event, true);
    } else if (isActivityScheduled(event)) {
      const commands = run(true);
      const events = [
        event,
        ...takeWhile(commands.length - 1, isActivityScheduled),
      ];
      if (events.length !== commands.length) {
        throw new DeterminismError();
      }
      for (let i = 0; i < commands.length; i++) {
        const event = events[i]!;
        const command = commands[i]!;

        if (!isCorresponding(event, command)) {
          throw new DeterminismError();
        }
      }
    }
  }

  const commands = [];

  // run out the remaining completion events and collect any scheduled commands
  // we do this because events come in chunks of Scheduled/Completed
  // [...scheduled, ...completed, ...scheduled]
  // if the history's tail contains completed events, e.g. [...scheduled, ...completed]
  // then we need to apply the completions, wake threads and schedule any produced commands
  while ((event = pop())) {
    if (isActivityScheduled(event)) {
      // it should be impossible to receive a scheduled event
      // -> because the tail of history can only contain completion events
      // -> scheduled events stored in history should correspond to commands
      //    -> or else a determinism error would have been thrown
      throw new Error("illegal state");
    }
    commitCompletionEvent(event, false);
    commands.push(...run(false));
  }

  while (canMakeProgress()) {
    // continue progressing the program until all possible progress has been made
    commands.push(...run(false));
  }

  const result = tryResolveResult(mainThread);

  return {
    result,
    commands: commands,
  };

  function canMakeProgress() {
    return Array.from(threadTable).some(isAwake);
  }

  function run(replay: boolean): Command[] {
    const commands: Command[] = [];
    while (canMakeProgress()) {
      const newCommands = Array.from(threadTable).flatMap((thread) =>
        runIfAwake(thread, replay)
      );
      commands.push(...newCommands);
      newCommands.forEach((command) => {
        // assign command sequences in order of when they were spawned
        command.seq = nextSeq();
        commandTable[command.seq] = command;
      });
    }
    return commands;
  }

  /**
   * Try and make progress in a thread if it can be woken up
   * with a new value.
   */
  function runIfAwake(thread: Thread, replay: boolean): Command[] {
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
     * Wakes up a thread with a new value and return any newly spawned Commands.
     */
    function wakeThread(
      thread: Thread,
      result: Result<any> | undefined
    ): Command[] {
      if (result && isPending(result)) {
        return [];
      }

      try {
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
      } catch (err) {
        threadTable.delete(thread);
        thread.result = Result.failed(err);
      }

      const activities = collectActivities();
      activities.filter(isThread).forEach((thread) => threadTable.add(thread));

      return activities.flatMap((spawned) => {
        if (isCommand(spawned)) {
          return [spawned];
        } else if (isThread(spawned)) {
          return runIfAwake(spawned, replay);
        } else {
          return [];
        }
      });
    }
  }

  function isAwake(thread: Thread): boolean {
    return thread.awaiting === undefined || isDone(thread.awaiting);
  }

  function isDone(activity: Activity): boolean {
    const result = activity.result;
    if (isResolved(result) || isFailed(result)) {
      return true;
    } else if (isAwaitAll(activity)) {
      return activity.activities.every(isDone);
    } else {
      return false;
    }
  }

  function tryResolveResult(activity: Activity): Result | undefined {
    if (isCommand(activity)) {
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

  function commitCompletionEvent(
    event: ActivityCompleted | ActivityFailed,
    isReplay: boolean
  ) {
    const command = commandTable[event.seq];
    if (command === undefined) {
      throw new DeterminismError();
    }
    if (isReplay && command.result && !isPending(command.result)) {
      throw new DeterminismError();
    }
    command.result = isActivityCompleted(event)
      ? Result.resolved(event.result)
      : Result.failed(event.error);
  }
}

function isCorresponding(event: ActivityScheduled, command: Command) {
  return (
    event.seq === command.seq && event.name === command.name
    // TODO: also validate arguments
  );
}
