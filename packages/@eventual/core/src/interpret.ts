import { Future, isFuture } from "./future";
import { isAwaitAll } from "./await-all";
import { ActivityCall, isActivityCall } from "./activity-call";
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
import {
  Result,
  isResolved,
  isFailed,
  isPending,
  Resolved,
  Failed,
} from "./result";
import { createChain, isChain, Chain } from "./chain";
import { assertNever } from "./util";
import { Command } from "./command";

export interface WorkflowResult<T = any> {
  /**
   * The Result if this chain has terminated.
   */
  result?: Result<T>;
  /**
   * Any Commands that need to be scheduled.
   *
   * This can still be non-empty even if the chain has terminated because of dangling promises.
   */
  commands: Command[];
}

export type HistoryEvent =
  | ActivityScheduled
  | ActivityCompleted
  | ActivityFailed;

export type Program<Return = any> = Generator<Future, Return>;

/**
 * Interprets a workflow program
 */
export function interpret<Return>(
  program: Program<Return>,
  history: HistoryEvent[]
): WorkflowResult<Awaited<Return>> {
  const commandTable: Record<number, ActivityCall> = {};
  const mainChain = createChain(program);
  const activeChains = new Set([mainChain]);

  let seq = 0;
  function nextSeq() {
    return seq++;
  }

  let historyIndex = 0;
  function peek() {
    return history[historyIndex];
  }
  function pop() {
    return history[historyIndex++];
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
      const commands = advance(true) ?? [];
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

  const activityCalls = [];

  // run out the remaining completion events and collect any scheduled commands
  // we do this because events come in chunks of Scheduled/Completed
  // [...scheduled, ...completed, ...scheduled]
  // if the history's tail contains completed events, e.g. [...scheduled, ...completed]
  // then we need to apply the completions, resume chains and schedule any produced commands
  while ((event = pop())) {
    if (isActivityScheduled(event)) {
      // it should be impossible to receive a scheduled event
      // -> because the tail of history can only contain completion events
      // -> scheduled events stored in history should correspond to commands
      //    -> or else a determinism error would have been thrown
      throw new Error("illegal state");
    }
    commitCompletionEvent(event, false);

    activityCalls.push(...(advance(false) ?? []));
  }

  let newCommands;
  while ((newCommands = advance(false))) {
    // continue advancing the program until all possible progress has been made
    activityCalls.push(...newCommands);
  }

  const result = tryResolveResult(mainChain);

  return {
    result,
    commands: activityCalls.map((call) => ({
      args: call.args,
      name: call.name,
      seq: call.seq!,
    })),
  };

  function advance(isReplay: boolean): ActivityCall[] | undefined {
    let commands: ActivityCall[] | undefined;
    let madeProgress: boolean;
    do {
      madeProgress = false;
      for (const chain of activeChains) {
        const producedCommands = tryAdvanceChain(chain, isReplay);
        if (producedCommands !== undefined) {
          madeProgress = true;
          for (const command of producedCommands) {
            if (commands === undefined) {
              commands = [];
            }
            commands.push(command);
            // assign command sequences in order of when they were spawned
            command.seq = nextSeq();
            commandTable[command.seq] = command;
          }
        }
      }
    } while (madeProgress);
    return commands;
  }

  /**
   * Try and advance chain if it can be resumed up with a new value.
   *
   * Returns an array of Commands if the chain progressed, otherwise `undefined`:
   * 1. If an empty array of Commands is returned, it indicates that the chain woke up
   *    but did not emit any new Commands.
   * 2. An `undefined` return value indicates that the chain did not advance
   */
  function tryAdvanceChain(
    chain: Chain,
    isReplay: boolean
  ): ActivityCall[] | undefined {
    if (chain.awaiting === undefined) {
      // this is the first time the chain is running, so wake it with an undefined input
      return advanceChain(chain, undefined);
    }
    const result = tryResolveResult(chain.awaiting);
    if (result === undefined) {
      return undefined;
    } else if (isResolved(result) || isFailed(result)) {
      return advanceChain(chain, result);
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
          // chain cannot wake up because we're waiting on all tasks
          return undefined;
        } else if (isFailed(result)) {
          // one of the inner activities has failed, the chain should throw
          return advanceChain(chain, result);
        } else {
          results.push(result.value);
        }
      }
      return advanceChain(chain, Result.resolved(results));
    } else {
      return undefined;
    }

    /**
     * Resumes a {@link Chain} with a new value and return any newly spawned {@link ActivityCall}s.
     */
    function advanceChain(
      chain: Chain,
      result: Resolved | Failed | undefined
    ): ActivityCall[] {
      try {
        const iterResult =
          result === undefined || isResolved(result)
            ? chain.next(result?.value)
            : chain.throw(result.error);
        if (iterResult.done) {
          activeChains.delete(chain);
          if (isFuture(iterResult.value)) {
            chain.result = Result.pending(iterResult.value);
          } else if (isGenerator(iterResult.value)) {
            const childChain = createChain(iterResult.value);
            activeChains.add(childChain);
            chain.result = Result.pending(childChain);
          } else {
            chain.result = Result.resolved(iterResult.value);
          }
        } else {
          chain.awaiting = iterResult.value;
        }
      } catch (err) {
        activeChains.delete(chain);
        chain.result = Result.failed(err);
      }

      return collectActivities().flatMap((activity) => {
        if (isActivityCall(activity)) {
          return [activity];
        } else if (isChain(activity)) {
          activeChains.add(activity);
          return tryAdvanceChain(activity, isReplay) ?? [];
        } else {
          return [];
        }
      });
    }
  }

  function tryResolveResult(activity: Future): Result | undefined {
    if (isActivityCall(activity)) {
      return activity.result;
    } else if (isChain(activity)) {
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

function isCorresponding(event: ActivityScheduled, command: ActivityCall) {
  return (
    event.seq === command.seq && event.name === command.name
    // TODO: also validate arguments
  );
}

function isGenerator(a: any): a is Program {
  return (
    a &&
    typeof a === "object" &&
    typeof a.next === "function" &&
    typeof a.return === "function" &&
    typeof a.throw === "function"
  );
}
