import {
  CommandCall,
  Eventual,
  isCommandCall,
  isEventual,
} from "./eventual.js";
import { isAwaitAll } from "./await-all.js";
import { isActivityCall } from "./activity-call.js";
import { DeterminismError } from "./error.js";
import {
  EventualEvent,
  EventualResultEvent,
  EventualScheduledEvent,
  isActivityCompleted,
  isActivityScheduled,
  isEventualResultEvent,
  isEventualScheduledEvent,
  isSleepCompleted,
  isSleepScheduled,
} from "./events.js";
import { collectActivities } from "./global.js";
import {
  Result,
  isResolved,
  isFailed,
  isPending,
  Resolved,
  Failed,
} from "./result.js";
import { createChain, isChain, Chain } from "./chain.js";
import { assertNever } from "./util.js";
import { Command, CommandType } from "./command.js";
import { isSleepForCall, isSleepUntilCall } from "./sleep-call.js";

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

export type Program<Return = any> = Generator<Eventual, Return>;

/**
 * Interprets a workflow program
 */
export function interpret<Return>(
  program: Program<Return>,
  history: EventualEvent[]
): WorkflowResult<Awaited<Return>> {
  const callTable: Record<number, CommandCall> = {};
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
  while ((event = peek()) && peekForward(isEventualScheduledEvent)) {
    pop();

    if (isEventualResultEvent(event)) {
      commitCompletionEvent(event, true);
    } else if (isEventualScheduledEvent(event)) {
      const calls = advance(true) ?? [];
      const events = [
        event,
        ...takeWhile(calls.length - 1, isEventualScheduledEvent),
      ];
      if (events.length !== calls.length) {
        throw new DeterminismError();
      }
      for (let i = 0; i < calls.length; i++) {
        const event = events[i]!;
        const call = calls[i]!;

        if (!isCorresponding(event, call)) {
          throw new DeterminismError();
        }
      }
    }
  }

  const calls = [];

  // run out the remaining completion events and collect any scheduled activity calls
  // we do this because events come in chunks of Scheduled/Completed
  // [...scheduled, ...completed, ...scheduled]
  // if the history's tail contains completed events, e.g. [...scheduled, ...completed]
  // then we need to apply the completions, resume chains and schedule any produced activity calls
  while ((event = pop())) {
    if (isEventualScheduledEvent(event)) {
      // it should be impossible to receive a scheduled event
      // -> because the tail of history can only contain completion events
      // -> scheduled events stored in history should correspond to activity calls
      //    -> or else a determinism error would have been thrown
      throw new Error("illegal state");
    }
    commitCompletionEvent(event, false);

    calls.push(...(advance(false) ?? []));
  }

  let newCommands;
  while ((newCommands = advance(false))) {
    // continue advancing the program until all possible progress has been made
    calls.push(...newCommands);
  }

  const result = tryResolveResult(mainChain);

  return {
    result,
    commands: calls.map((call) =>
      isActivityCall(call)
        ? {
            // TODO: add sleep
            type: CommandType.StartActivity,
            args: call.args,
            name: call.name,
            seq: call.seq!,
          }
        : isSleepUntilCall(call)
        ? {
            type: CommandType.SleepUntil,
            seq: call.seq!,
            untilTime: call.isoDate,
          }
        : {
            type: CommandType.SleepFor,
            seq: call.seq!,
            durationSeconds: call.durationSeconds,
          }
    ),
  };

  function advance(isReplay: boolean): CommandCall[] | undefined {
    let calls: CommandCall[] | undefined;
    let madeProgress: boolean;
    do {
      madeProgress = false;
      for (const chain of activeChains) {
        const producedCalls = tryAdvanceChain(chain, isReplay);
        if (producedCalls !== undefined) {
          madeProgress = true;
          for (const call of producedCalls) {
            if (calls === undefined) {
              calls = [];
            }
            calls.push(call);
            // assign sequences in order of when they were spawned
            call.seq = nextSeq();
            callTable[call.seq] = call;
          }
        }
      }
    } while (madeProgress);
    return calls;
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
  ): CommandCall[] | undefined {
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
     * Resumes a {@link Chain} with a new value and return any newly spawned {@link CommandCall}s.
     */
    function advanceChain(
      chain: Chain,
      result: Resolved | Failed | undefined
    ): CommandCall[] {
      try {
        const iterResult =
          result === undefined || isResolved(result)
            ? chain.next(result?.value)
            : chain.throw(result.error);
        if (iterResult.done) {
          activeChains.delete(chain);
          if (isEventual(iterResult.value)) {
            chain.result = Result.pending(iterResult.value);
          } else if (isGenerator(iterResult.value)) {
            const childChain = createChain(iterResult.value);
            activeChains.add(childChain);
            chain.result = Result.pending(childChain);
          } else {
            chain.result = Result.resolved(iterResult.value);
          }
        } else if (
          !isChain(iterResult.value) &&
          isGenerator(iterResult.value)
        ) {
          const childChain = createChain(iterResult.value);
          activeChains.add(childChain);
          chain.awaiting = childChain;
        } else {
          chain.awaiting = iterResult.value;
        }
      } catch (err) {
        activeChains.delete(chain);
        chain.result = Result.failed(err);
      }

      return collectActivities().flatMap((activity) => {
        if (isCommandCall(activity)) {
          return activity;
        } else if (isChain(activity)) {
          activeChains.add(activity);
          return tryAdvanceChain(activity, isReplay) ?? [];
        } else if (isAwaitAll(activity)) {
          return [];
        }

        return assertNever(activity);
      });
    }
  }

  function tryResolveResult(activity: Eventual): Result | undefined {
    if (isCommandCall(activity)) {
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
    event: EventualResultEvent,
    isReplay: boolean
  ) {
    const call = callTable[event.seq];
    if (call === undefined) {
      throw new DeterminismError(`Call for seq ${event.seq} was not emitted.`);
    }
    if (isReplay && call.result && !isPending(call.result)) {
      throw new DeterminismError(
        `Expected call result to not be pending: ${call.seq}.`
      );
    }
    call.result = isActivityCompleted(event)
      ? Result.resolved(event.result)
      : isSleepCompleted(event)
      ? Result.resolved(undefined)
      : Result.failed(event.error);
  }
}

function isCorresponding(event: EventualScheduledEvent, call: CommandCall) {
  if (event.seq !== call.seq) {
    return false;
  } else if (isActivityScheduled(event)) {
    return isActivityCall(call) && call.name === event.name;
  } else if (isSleepScheduled(event)) {
    return isSleepUntilCall(call) || isSleepForCall(call);
  }
  return assertNever(event);
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
