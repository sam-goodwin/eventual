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
  CompletedEvent,
  FailedEvent,
  HistoryEvent,
  isActivityCompleted,
  isActivityScheduled,
  isCompletedEvent,
  isFailedEvent,
  isScheduledEvent,
  isSleepCompleted,
  isSleepScheduled,
  ScheduledEvent,
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
  history: HistoryEvent[]
): WorkflowResult<Awaited<Return>> {
  const callTable: Record<number, CommandCall> = {};
  const mainChain = createChain(program);
  const activeChains = new Set([mainChain]);

  let seq = 0;
  function nextSeq() {
    return seq++;
  }

  let emittedEvents = new Iterator(history, isScheduledEvent);
  let resultEvents = new Iterator(
    history,
    (e): e is CompletedEvent | FailedEvent =>
      isCompletedEvent(e) || isFailedEvent(e)
  );

  /**
   * Try to advance machine
   * While we have calls and emitted events, drain the queues.
   * When we run out of emitted events or calls, try to apply the next result event
   * advance run again
   * any calls at the event of all result commands and advances, return
   */
  let calls: CommandCall[] = [];
  let newCalls: Iterator<CommandCall, CommandCall>;
  // iterate until we are no longer finding commands or no longer have completion events to apply
  while (
    (newCalls = new Iterator(advance(true) ?? [])).hasNext() ||
    resultEvents.hasNext()
  ) {
    // Match and filter found commands against the given scheduled events.
    // scheduled events must be in order or not present.
    while (newCalls.hasNext() && emittedEvents.hasNext()) {
      const call = newCalls.next()!;
      const event = emittedEvents.next()!;

      if (!isCorresponding(event, call)) {
        throw new DeterminismError(
          `Workflow returned ${JSON.stringify(call)}, but ${JSON.stringify(
            event
          )} was expected at ${event?.seq}`
        );
      }
    }

    // if there are result events (compelted or failed), apply it before the next run
    if (resultEvents.hasNext()) {
      const resultEvent = resultEvents.next()!;

      commitCompletionEvent(resultEvent, true);
    }

    // any calls not matched against historical schedule events will be returned to the caller.
    calls.push(...newCalls.drain());
  }

  // if the history shows events have been scheduled, but we did not find them when running the workflow,
  // something is wrong, fail
  if (emittedEvents.hasNext()) {
    throw new DeterminismError(
      "Work did not return expected commands: " + JSON.stringify(emittedEvents)
    );
  }

  const result = tryResolveResult(mainChain);

  return {
    result,
    commands: calls.map(
      (call): Command =>
        isActivityCall(call)
          ? {
              // TODO: add sleep
              kind: CommandType.StartActivity,
              args: call.args,
              name: call.name,
              seq: call.seq!,
            }
          : isSleepUntilCall(call)
          ? {
              kind: CommandType.SleepUntil,
              seq: call.seq!,
              untilTime: call.isoDate,
            }
          : {
              kind: CommandType.SleepFor,
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
        console.log("Activity Collected", JSON.stringify(activity));
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
    event: CompletedEvent | FailedEvent,
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

function isCorresponding(event: ScheduledEvent, call: CommandCall) {
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

class Iterator<I, T extends I> {
  private cursor = 0;
  constructor(private elms: I[], private predicate?: (elm: I) => elm is T) {}

  private seek() {
    if (this.predicate) {
      while (this.cursor < this.elms.length) {
        if (this.predicate(this.elms[this.cursor]!)) {
          return;
        }
        this.cursor++;
      }
    }
  }

  hasNext() {
    this.seek();
    return this.cursor < this.elms.length;
  }

  next(): T {
    this.seek();
    return this.elms[this.cursor++] as T;
  }

  drain(): T[] {
    return this.predicate
      ? this.elms.slice(this.cursor).filter(this.predicate)
      : (this.elms.slice(this.cursor) as T[]);
  }
}
