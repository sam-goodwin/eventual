import {
  Eventual,
  isEventual,
  CommandCall,
  isCommandCall,
  EventualCallCollector,
} from "./eventual.js";
import { isAwaitAll } from "./await-all.js";
import { isActivityCall } from "./calls/activity-call.js";
import { DeterminismError } from "./error.js";
import {
  CompletedEvent,
  SignalReceived,
  FailedEvent,
  HistoryEvent,
  isActivityScheduled,
  isChildWorkflowScheduled,
  isCompletedEvent,
  isSignalReceived,
  isFailedEvent,
  isScheduledEvent,
  isSleepCompleted,
  isSleepScheduled,
  isWaitForSignalStarted,
  isWaitForSignalTimedOut,
  ScheduledEvent,
  isSignalSent,
  isConditionStarted,
  isConditionTimedOut,
} from "./events.js";
import {
  Result,
  isResolved,
  isFailed,
  isPending,
  Resolved,
  Failed,
} from "./result.js";
import { createChain, isChain, Chain } from "./chain.js";
import { assertNever, or } from "./util.js";
import { Command, CommandType } from "./command.js";
import { isSleepForCall, isSleepUntilCall } from "./calls/sleep-call.js";
import {
  isWaitForSignalCall,
  WaitForSignalCall,
} from "./calls/wait-for-signal-call.js";
import {
  isRegisterSignalHandlerCall,
  RegisterSignalHandlerCall,
} from "./calls/signal-handler-call.js";
import { isSendSignalCall } from "./calls/send-signal-call.js";
import { isWorkflowCall } from "./calls/workflow-call.js";
import { clearEventualCollector, setEventualCollector } from "./global.js";
import { isConditionCall } from "./calls/condition-call.js";

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

export type Program<Return = any> = Generator<Eventual, Return, any>;

/**
 * Interprets a workflow program
 */
export function interpret<Return>(
  program: Program<Return>,
  history: HistoryEvent[]
): WorkflowResult<Awaited<Return>> {
  const callTable: Record<number, CommandCall> = {};
  /**
   * A map of signalIds to calls and handlers that are listening for this signal.
   */
  const signalSubscriptions: Record<
    string,
    (WaitForSignalCall | RegisterSignalHandlerCall)[]
  > = {};
  const mainChain = createChain(program);
  const activeChains = new Set([mainChain]);

  let seq = 0;
  function nextSeq() {
    return seq++;
  }

  let emittedEvents = iterator(history, isScheduledEvent);
  let resultEvents = iterator(
    history,
    or(isCompletedEvent, isFailedEvent, isSignalReceived)
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
    (newCalls = iterator(advance() ?? [])).hasNext() ||
    resultEvents.hasNext()
  ) {
    // if there are result events (completed or failed), apply it before the next run
    if (!newCalls.hasNext() && resultEvents.hasNext()) {
      const resultEvent = resultEvents.next()!;

      // it is possible that committing events
      newCalls = iterator(
        collectActivitiesScope(() => {
          if (isSignalReceived(resultEvent)) {
            commitSignal(resultEvent);
          } else {
            commitCompletionEvent(resultEvent);
          }
        })
      );
    }

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

    // any calls not matched against historical schedule events will be returned to the caller.
    calls.push(...newCalls.drain());
  }

  // if the history shows events have been scheduled, but we did not find them when running the workflow,
  // something is wrong, fail
  if (emittedEvents.hasNext()) {
    throw new DeterminismError(
      "Workflow did not return expected commands: " +
        JSON.stringify(emittedEvents.drain())
    );
  }

  const result = tryResolveResult(mainChain);

  return {
    result,
    commands: calls.flatMap(callToCommand),
  };

  function callToCommand(call: CommandCall): Command[] | Command {
    if (isActivityCall(call)) {
      return {
        // TODO: add sleep
        kind: CommandType.StartActivity,
        args: call.args,
        name: call.name,
        seq: call.seq!,
      };
    } else if (isSleepUntilCall(call)) {
      return {
        kind: CommandType.SleepUntil,
        seq: call.seq!,
        untilTime: call.isoDate,
      };
    } else if (isSleepForCall(call)) {
      return {
        kind: CommandType.SleepFor,
        seq: call.seq!,
        durationSeconds: call.durationSeconds,
      };
    } else if (isWorkflowCall(call)) {
      return {
        kind: CommandType.StartWorkflow,
        seq: call.seq!,
        input: call.input,
        name: call.name,
      };
    } else if (isWaitForSignalCall(call)) {
      return {
        kind: CommandType.WaitForSignal,
        signalId: call.signalId,
        seq: call.seq!,
        timeoutSeconds: call.timeoutSeconds,
      };
    } else if (isSendSignalCall(call)) {
      return {
        kind: CommandType.SendSignal,
        signalId: call.signalId,
        target: call.target,
        seq: call.seq!,
        payload: call.payload,
      };
    } else if (isConditionCall(call)) {
      return {
        kind: CommandType.StartCondition,
        seq: call.seq!,
        timeoutSeconds: call.timeoutSeconds,
      };
    } else if (isRegisterSignalHandlerCall(call)) {
      return [];
    }

    return assertNever(call);
  }

  function advance(): CommandCall[] | undefined {
    let madeProgress: boolean;

    return collectActivitiesScope(() => {
      do {
        madeProgress = false;
        for (const chain of activeChains) {
          madeProgress = madeProgress || tryAdvanceChain(chain);
        }
      } while (madeProgress);
    });
  }

  function collectActivitiesScope(func: () => void): CommandCall[] {
    let calls: CommandCall[] = [];

    const collector: EventualCallCollector = {
      /**
       * The returned activity is available to the workflow and may be yielded later if it was not already.
       */
      pushEventual(activity) {
        if (isCommandCall(activity)) {
          if (isWaitForSignalCall(activity)) {
            subscribeToSignal(activity.signalId, activity);
          } else if (isConditionCall(activity)) {
            // if the condition is resolvable, don't add it to the calls.
            const result = tryResolveResult(activity);
            if (result) {
              return activity;
            }
          } else if (isRegisterSignalHandlerCall(activity)) {
            subscribeToSignal(activity.signalId, activity);
            // signal handler does not emit a call/command. It is only internal.
            return activity;
          }
          activity.seq = nextSeq();
          callTable[activity.seq!] = activity;
          calls.push(activity);
          return activity;
        } else if (isChain(activity)) {
          activeChains.add(activity);
          tryAdvanceChain(activity);
          return activity;
        } else if (isAwaitAll(activity)) {
          return activity;
        }
        return assertNever(activity);
      },
    };

    try {
      setEventualCollector(collector);

      func();
    } finally {
      clearEventualCollector();
    }

    return calls;
  }

  function subscribeToSignal(
    signalId: string,
    sub: WaitForSignalCall | RegisterSignalHandlerCall
  ) {
    if (!(signalId in signalSubscriptions)) {
      signalSubscriptions[signalId] = [];
    }
    signalSubscriptions[signalId]!.push(sub);
  }

  /**
   * Try and advance chain if it can be resumed up with a new value.
   *
   * Returns an array of Commands if the chain progressed, otherwise `undefined`:
   * 1. If an empty array of Commands is returned, it indicates that the chain woke up
   *    but did not emit any new Commands.
   * 2. An `undefined` return value indicates that the chain did not advance
   */
  function tryAdvanceChain(chain: Chain): boolean {
    if (chain.awaiting === undefined) {
      // this is the first time the chain is running, so wake it with an undefined input
      advanceChain(chain, undefined);
      return true;
    }
    const result = tryResolveResult(chain.awaiting);
    if (result === undefined) {
      return false;
    } else if (isResolved(result) || isFailed(result)) {
      advanceChain(chain, result);
      return true;
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
          return false;
        } else if (isFailed(result)) {
          // one of the inner activities has failed, the chain should throw
          advanceChain(chain, result);
          return true;
        } else {
          results.push(result.value);
        }
      }
      advanceChain(chain, Result.resolved(results));
      return true;
    } else {
      return false;
    }

    /**
     * Resumes a {@link Chain} with a new value and return any newly spawned {@link CommandCall}s.
     */
    function advanceChain(
      chain: Chain,
      result: Resolved | Failed | undefined
    ): void {
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
        console.error(chain, err);
        activeChains.delete(chain);
        chain.result = Result.failed(err);
      }
    }
  }

  function tryResolveResult(activity: Eventual): Result | undefined {
    if (isCommandCall(activity)) {
      if (isConditionCall(activity)) {
        if (activity.result) {
          return activity.result;
        }
        const predicateResult = activity.predicate();
        const { value, done } =
          isChain(predicateResult) &&
          predicateResult.result &&
          isResolved(predicateResult.result)
            ? { value: predicateResult.result.value, done: true }
            : isGenerator(predicateResult)
            ? predicateResult.next()
            : { value: predicateResult, done: true };
        if (!done) {
          activity.result = Result.failed(
            "Condition Predicates must be synchronous"
          );
        } else if (value) {
          activity.result = Result.resolved(true);
        } else {
          return undefined;
        }
      }
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

  /**
   * Add result to WaitForSignal and call any event handlers.
   */
  function commitSignal(signal: SignalReceived) {
    const subscriptions = signalSubscriptions[signal.signalId];

    subscriptions?.forEach((sub) => {
      if (isWaitForSignalCall(sub)) {
        if (!sub.result) {
          sub.result = Result.resolved(signal.payload);
        }
      } else if (isRegisterSignalHandlerCall(sub)) {
        if (!sub.result) {
          // call the handler
          // the transformer may wrap the handler function as a chain, it will be registered internally
          const output = sub.handler(signal.payload);
          // if the handler returns generator instead, start a new chain
          if (isGenerator(output)) {
            activeChains.add(createChain(output));
          }
        }
      }
    });
  }

  function commitCompletionEvent(event: CompletedEvent | FailedEvent) {
    const call = callTable[event.seq];
    if (call === undefined) {
      throw new DeterminismError(`Call for seq ${event.seq} was not emitted.`);
    }
    if (call.result && !isPending(call.result)) {
      return;
    }
    call.result = isCompletedEvent(event)
      ? Result.resolved(event.result)
      : isSleepCompleted(event)
      ? Result.resolved(undefined)
      : isWaitForSignalTimedOut(event)
      ? // TODO: should this throw a specific error type?
        Result.failed("Wait For Signal Timed Out")
      : isConditionTimedOut(event)
      ? Result.failed("Condition Timed Out")
      : Result.failed(event.error);
  }
}

function isCorresponding(event: ScheduledEvent, call: CommandCall) {
  if (event.seq !== call.seq) {
    return false;
  } else if (isActivityScheduled(event)) {
    return isActivityCall(call) && call.name === event.name;
  } else if (isChildWorkflowScheduled(event)) {
    return isWorkflowCall(call) && call.name === event.name;
  } else if (isSleepScheduled(event)) {
    return isSleepUntilCall(call) || isSleepForCall(call);
  } else if (isWaitForSignalStarted(event)) {
    return isWaitForSignalCall(call) && event.signalId == call.signalId;
  } else if (isSignalSent(event)) {
    return isSendSignalCall(call) && event.signalId === call.signalId;
  } else if (isConditionStarted(event)) {
    return isConditionCall(call);
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

interface Iterator<I, T extends I> {
  hasNext(): boolean;
  next(): T | undefined;
  drain(): T[];
}

function iterator<I, T extends I>(
  elms: I[],
  predicate?: (elm: I) => elm is T
): Iterator<I, T> {
  let cursor = 0;
  return {
    hasNext: () => {
      seek();
      return cursor < elms.length;
    },
    next: (): T => {
      seek();
      return elms[cursor++] as T;
    },
    drain: (): T[] => {
      return predicate
        ? elms.slice(cursor).filter(predicate)
        : (elms.slice(cursor) as T[]);
    },
  };

  function seek() {
    if (predicate) {
      while (cursor < elms.length) {
        if (predicate(elms[cursor]!)) {
          return;
        }
        cursor++;
      }
    }
  }
}
