import {
  DeterminismError,
  Signal,
  Timeout,
  Workflow,
  WorkflowContext,
} from "@eventual/core";
import {
  enterWorkflowHookScope,
  EventualCall,
  EventualPromise,
  EventualPromiseSymbol,
  ExecutionWorkflowHook,
  HistoryEvent,
  HistoryResultEvent,
  HistoryScheduledEvent,
  isResultEvent,
  isScheduledEvent,
  isSignalReceived,
  isWorkflowRunStarted,
  isWorkflowTimedOut,
  iterator,
  Result,
  SignalReceived,
  WorkflowEvent,
  _Iterator,
} from "@eventual/core/internal";
import { isPromise } from "util/types";
import { createEventualFromCall, isCorresponding } from "./eventual-factory.js";
import { isFailed, isResolved } from "./result.js";
import type { WorkflowCommand } from "./workflow-command.js";

/**
 * Put the resolve method on the promise, but don't expose it.
 */
export interface RuntimeEventualPromise<R> extends EventualPromise<R> {
  resolve: (result: Result<R>) => void;
}

/**
 * Values used to interact with an eventual while it is active.
 */
interface ActiveEventual<R = any> {
  /**
   * A reference to the promise passed back to the workflow.
   */
  promise: RuntimeEventualPromise<R>;
  /**
   * Back reference from eventual to the signals it consumes.
   *
   * Intended to reduce searching when deactivating an eventual.
   */
  signals?: string[];
  /**
   * The sequence number of the eventual.
   */
  seq: number;
}

export function createEventualPromise<R>(
  seq: number,
  beforeResolve?: () => void
): RuntimeEventualPromise<R> {
  let resolve: (r: R) => void, reject: (reason: any) => void;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  }) as RuntimeEventualPromise<R>;
  promise[EventualPromiseSymbol] = seq;
  promise.resolve = (result) => {
    beforeResolve?.();
    if (isResolved(result)) {
      resolve(result.value);
    } else {
      reject(result.error);
    }
  };
  return promise;
}

interface ExecutorOptions {
  hooks?: {
    /**
     * Callback called when a returned call matches an input event.
     *
     * This call will be ignored.
     */
    historicalEventMatched?: (event: WorkflowEvent, call: EventualCall) => void;

    /**
     * Callback immediately before applying a result event.
     */
    beforeApplyingResultEvent?: (resultEvent: HistoryResultEvent) => void;
  };
}

export class WorkflowExecutor<Input, Output> {
  /**
   * The sequence number to assign to the next eventual registered.
   */
  private nextSeq: number;
  /**
   * All {@link EventualDefinition} which are still active.
   */
  private activeEventuals: Record<number, ActiveEventual> = {};
  /**
   * All {@link EventualDefinition}s waiting on a signal.
   */
  private activeHandlers: {
    events: Record<number, Record<string, EventTrigger<any, any>["handler"]>>;
    signals: Record<string, Record<number, SignalTrigger<any, any>["handler"]>>;
    afterEveryEvent: Record<number, AfterEveryEventTrigger<any>["afterEvery"]>;
  } = {
    signals: {},
    events: {},
    afterEveryEvent: {},
  };
  /**
   * Iterator containing the in order events we expected to see in a deterministic workflow.
   */
  private expected: _Iterator<HistoryEvent, HistoryScheduledEvent>;
  /**
   * Iterator containing events to apply.
   */
  private events: _Iterator<HistoryEvent, HistoryResultEvent>;

  /**
   * Set when the workflow is started.
   */
  private started?: {
    /**
     * When called, resolves the workflow execution with a {@link result}.
     *
     * This will cause the current promise from start or continue to resolve with a the given value.
     */
    resolve: (result?: Result) => void;
  };
  private commandsToEmit: WorkflowCommand[];
  public result?: Result<Output>;

  constructor(
    private workflow: Workflow<Input, Output>,
    private history: HistoryEvent[],
    private options?: ExecutorOptions
  ) {
    this.nextSeq = 0;
    this.expected = iterator(history, isScheduledEvent);
    this.events = iterator(history, isResultEvent);
    this.commandsToEmit = [];
  }

  /**
   * Starts an execution.
   *
   * The execution will run until the events are exhausted or the workflow fails.
   */
  public start(
    input: Input,
    context: WorkflowContext
  ): Promise<WorkflowResult<Output>> {
    if (this.started) {
      throw new Error(
        "Execution has already been started. Use continue to apply new events or create a new Interpreter"
      );
    }

    // start a workflow run and start the workflow itself.
    return this.startWorkflowRun(() => {
      try {
        const workflowPromise = this.workflow.definition(input, context);
        workflowPromise.then(
          // successfully completed workflows can continue to retrieve events.
          // TODO: make this configurable?
          (result) => (this.result = Result.resolved(result)),
          // failed workflows will stop accepting events
          (err) => this.endWorkflowRun(Result.failed(err))
        );
      } catch (err) {
        // handle any synchronous errors.
        this.endWorkflowRun(Result.failed(err));
      }
    });
  }

  /**
   * Continue a previously started workflow by feeding in new {@link HistoryResultEvent}, possibly advancing the execution.
   *
   * This allows the workflow to continue without re-running previous history.
   *
   * Events will be applied to the workflow in order.
   *
   * The execution will run until the events are exhausted or the workflow fails.
   *
   * @returns {@link WorkflowResult} - containing new commands and a result of one was generated.
   */
  public async continue(
    ...history: HistoryResultEvent[]
  ): Promise<WorkflowResult<Output>> {
    if (!this.started) {
      throw new Error("Execution has not been started, call start first.");
    }

    this.history.push(...history);

    return await this.startWorkflowRun();
  }

  private startWorkflowRun(beforeCommitEvents?: () => void) {
    return this.enterWorkflowHookScope(
      () =>
        new Promise<WorkflowResult<Output>>(async (resolve) => {
          // start context with execution hook
          this.started = {
            resolve: (result) => {
              resolve(this.flushCurrentWorkflowResult(result));
            },
          };
          // ensure the workflow hook is available to the workflow
          // and tied to the workflow promise context
          // Also ensure that any handlers like signal handlers returned by the workflow
          // have access to the workflow hook
          beforeCommitEvents?.();
          // APPLY EVENTS
          await this.drainHistoryEvents();

          // let everything that has started or will be started complete
          // set timeout adds the closure to the end of the event loop
          // this assumption breaks down when the user tries to start a promise
          // to accomplish non-deterministic actions like IO.
          setTimeout(() => {
            this.endWorkflowRun();
          });
        })
    );
  }

  private endWorkflowRun(result?: Result) {
    if (!this.started) {
      throw new Error("Execution is not started.");
    }
    this.started.resolve(result);
  }

  /**
   * Returns current result and commands, resetting the command array.
   *
   * If the workflow has additional expected events to apply, fails the workflow with a determinism error.
   */
  private flushCurrentWorkflowResult(
    overrideResult?: Result
  ): WorkflowResult<Output> {
    const newCommands = this.commandsToEmit;
    this.commandsToEmit = [];

    this.result = overrideResult ?? this.result;

    return { result: this.result, commands: newCommands };
  }

  /**
   * Provides a scope where the workflowHook is available to the {@link Call}s.
   */
  private async enterWorkflowHookScope<Res>(
    callback: (...args: any) => Res
  ): Promise<Awaited<Res>> {
    const self = this;
    const workflowHook: ExecutionWorkflowHook = {
      registerEventualCall<E extends EventualPromise<any>>(call: EventualCall) {
        try {
          const eventual = createEventualFromCall(call);
          const seq = self.nextSeq++;

          /**
           * if the call is new, generate and emit it's commands
           * if the eventual does not generate commands, do not check it against the expected events.
           */
          if (
            eventual.generateCommands &&
            !checkExpectedCallAndAdvance(seq, call)
          ) {
            self.commandsToEmit.push(
              ...normalizeToArray(eventual.generateCommands(seq))
            );
          }

          /**
           * If the eventual comes with a result, do not active it, it is already resolved!
           */
          if (isResolvedEventualDefinition(eventual)) {
            const promise = createEventualPromise<any>(seq);
            promise.resolve(eventual.result);
            return promise as unknown as E;
          }

          return self.activateEventual(seq, eventual) as E;
        } catch (err) {
          self.endWorkflowRun(Result.failed(err));
          throw err;
        }
      },
      resolveEventual(seq, result) {
        self.tryResolveEventual(seq, result);
      },
    };
    return await enterWorkflowHookScope(workflowHook, callback);

    /**
     * Checks the call against the expected events.
     * @returns false if the call is new and true if the call matches the expected events.
     * @throws {@link DeterminismError} when the call is not expected and there are expected events remaining.
     */
    function checkExpectedCallAndAdvance(seq: number, call: EventualCall) {
      if (self.expected.hasNext()) {
        const expected = self.expected.next()!;

        self.options?.hooks?.historicalEventMatched?.(expected, call);

        if (!isCorresponding(expected, seq, call)) {
          throw new DeterminismError(
            `Workflow returned ${JSON.stringify(call)}, but ${JSON.stringify(
              expected
            )} was expected at ${expected?.seq}`
          );
        }
        return true;
      }
      return false;
    }
  }

  /**
   * Applies each of the history events to the workflow in the order they were received.
   *
   * Each event will find all of the applicable handlers and let them resolve
   * before applying the next set of events.
   */
  private async drainHistoryEvents() {
    while (this.events.hasNext() && !isFailed(this.result)) {
      const event = this.events.next()!;
      this.options?.hooks?.beforeApplyingResultEvent?.(event);
      await new Promise((resolve) => {
        setTimeout(() => {
          this.tryCommitResultEvent(event);
          resolve(undefined);
        });
      });
    }
  }

  /**
   * Applies a new event to the existing execution.
   *
   * 1. if the event is a timeout, timeout the workflow
   * 2. find all of the active eventuals that are waiting for the given event
   * 3. try to resolve each of the provided eventuals in order
   * 4. if the resolved eventuals have any dependents, try resolve them too until the queue is drained.
   *    note: dependents are those eventuals while have declared other eventuals they care about.
   */
  private tryCommitResultEvent(event: HistoryResultEvent) {
    if (isWorkflowTimedOut(event)) {
      return this.endWorkflowRun(
        Result.failed(new Timeout("Workflow timed out"))
      );
    } else if (!isWorkflowRunStarted(event)) {
      if (isSignalReceived(event)) {
        const signalHandlers =
          this.activeHandlers.signals[event.signalId] ?? {};
        Object.entries(signalHandlers)
          .filter(([seq]) => this.isEventualActive(seq))
          .map(([seq, handler]) => {
            this.tryResolveEventual(Number(seq), handler(event) ?? undefined);
          });
      } else {
        if (this.isEventualActive(event.seq)) {
          const eventHandler =
            this.activeHandlers.events[event.seq]?.[event.type];
          this.tryResolveEventual(
            event.seq,
            eventHandler?.(event) ?? undefined
          );
        } else if (event.seq >= this.nextSeq) {
          // if a workflow history event precedes the call, throw an error.
          // this should never happen if the workflow is deterministic.
          this.endWorkflowRun(
            Result.failed(
              new DeterminismError(`Call for seq ${event.seq} was not emitted.`)
            )
          );
        }
      }
      // resolve any eventuals should be triggered on each new event
      Object.entries(this.activeHandlers.afterEveryEvent)
        .filter(([seq]) => this.isEventualActive(seq))
        .forEach(([seq, handler]) => {
          this.tryResolveEventual(Number(seq), handler() ?? undefined);
        });
    }
  }

  /**
   * Attempts to provide a result to an eventual.
   *
   * If the eventual is not active, the result will be ignored.
   */
  private tryResolveEventual<R>(
    seq: number,
    result: Result<R> | undefined
  ): void {
    if (result) {
      const eventual = this.activeEventuals[seq];
      if (eventual) {
        eventual.promise.resolve(result);
      }
    }
  }

  private isEventualActive(seq: number | string) {
    return seq in this.activeEventuals;
  }

  /**
   * Apply the eventual to the runtime state.
   * An active eventual can be resolved and waited on, it is yet to have a resolve.
   *
   * Roughly the opposite of {@link deactivateEventual}.
   */
  private activateEventual(
    seq: number,
    eventual: UnresolvedEventualDefinition<any>
  ): EventualPromise<any> {
    /**
     * The promise that represents
     */
    const promise = createEventualPromise<any>(seq, () =>
      // ensure the eventual is deactivated when resolved
      this.deactivateEventual(seq)
    );

    const activeEventual: ActiveEventual<any> = {
      promise,
      seq,
    };

    /**
     * Add the eventual to the active eventual collection.
     *
     * This is how we determine which eventuals are active.
     */
    this.activeEventuals[seq] = activeEventual;

    const triggers = normalizeToArray(eventual.triggers).filter(
      (t): t is Exclude<typeof t, undefined> => !!t
    );

    const workflowEventTriggers = triggers.filter(isEventTrigger);
    if (workflowEventTriggers.length > 0) {
      this.activeHandlers.events[seq] = Object.fromEntries(
        workflowEventTriggers.map((eventTrigger) => [
          eventTrigger.eventType,
          eventTrigger.handler,
        ])
      );
    }

    /**
     * For each dependency, wire the dependency promise to the handler provided by the eventual.
     *
     * If the dependency resolves or rejects, pass the result along.
     */
    const promiseTriggers = triggers.filter(isPromiseTrigger);
    promiseTriggers.forEach((promiseTrigger) => {
      // in case someone sneaks a non-promise in here, just make it a promise
      (!isPromise(promiseTrigger.promise)
        ? Promise.resolve(promiseTrigger.promise)
        : promiseTrigger.promise
      ).then(
        (res) => {
          if (this.isEventualActive(seq)) {
            this.tryResolveEventual(
              seq,
              promiseTrigger.handler(Result.resolved(res)) ?? undefined
            );
          }
        },
        (err) => {
          if (this.isEventualActive(seq)) {
            this.tryResolveEventual(
              seq,
              promiseTrigger.handler(Result.failed(err)) ?? undefined
            );
          }
        }
      );
    });

    /**
     * If the eventual subscribes to a signal, add it to the map.
     */
    const signalTriggers = triggers.filter(isSignalTrigger);
    signalTriggers.forEach(
      (signalTrigger) =>
        (this.activeHandlers.signals[signalTrigger.signalId] = {
          ...(this.activeHandlers.signals[signalTrigger.signalId] ?? {}),
          [seq]: signalTrigger.handler,
        })
    );
    // maintain a reference to the signals this eventual is listening for
    // in order to effectively remove the handlers later.
    activeEventual.signals = signalTriggers.map((s) => s.signalId);

    /**
     * If the eventual should be invoked after each event is applied, add it to the set.
     */
    const [afterEventHandler] = triggers.filter(isAfterEveryEventTrigger);
    if (afterEventHandler) {
      this.activeHandlers.afterEveryEvent[seq] = afterEventHandler.afterEvery;
    }

    return activeEventual.promise;
  }

  /**
   * Remove an eventual from the active handlers.
   * An inactive eventual has already been resolved and has a result.
   *
   * Roughly the opposite of {@link activateEventual}.
   */
  private deactivateEventual(seq: number) {
    const active = this.activeEventuals[seq];
    if (active) {
      // if the eventual is has a result, immediately remove it
      delete this.activeEventuals[seq];
      delete this.activeHandlers.events[seq];
      delete this.activeHandlers.afterEveryEvent[seq];
      if (active.signals) {
        active.signals.forEach(
          (signal) => delete this.activeHandlers.signals[signal]?.[seq]
        );
      }
    }
  }
}

function normalizeToArray<T>(items?: T | T[]): T[] {
  return items ? (Array.isArray(items) ? items : [items]) : [];
}

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
  commands: WorkflowCommand[];
}

export type Trigger<OwnRes> =
  | PromiseTrigger<OwnRes>
  | EventTrigger<OwnRes>
  | AfterEveryEventTrigger<OwnRes>
  | SignalTrigger<OwnRes>;

export const Trigger = {
  promise: <OwnRes = any, Res = any>(
    promise: Promise<Res>,
    handler: PromiseTrigger<OwnRes, Res>["handler"]
  ): PromiseTrigger<OwnRes, Res> => {
    return {
      promise,
      handler,
    };
  },
  afterEveryEvent: <OwnRes = any>(
    handler: AfterEveryEventTrigger<OwnRes>["afterEvery"]
  ): AfterEveryEventTrigger<OwnRes> => {
    return {
      afterEvery: handler,
    };
  },
  workflowEvent: <OwnRes = any, T extends HistoryResultEvent["type"] = any>(
    eventType: T,
    handler: EventTrigger<OwnRes, HistoryResultEvent & { type: T }>["handler"]
  ): EventTrigger<OwnRes, HistoryResultEvent & { type: T }> => {
    return {
      eventType,
      handler,
    };
  },
  signal: <OwnRes = any, Payload = any>(
    signalId: Signal<Payload>["id"],
    handler: SignalTrigger<OwnRes, Payload>["handler"]
  ): SignalTrigger<OwnRes, Payload> => {
    return {
      signalId,
      handler,
    };
  },
};

export interface PromiseTrigger<OwnRes, Res = any> {
  promise: Promise<Res>;
  handler: (val: Result<Res>) => Result<OwnRes> | void;
}

export interface AfterEveryEventTrigger<OwnRes> {
  afterEvery: () => Result<OwnRes> | void;
}

export interface EventTrigger<
  out OwnRes = any,
  E extends HistoryResultEvent = any
> {
  eventType: E["type"];
  handler: (event: E) => Result<OwnRes> | void;
}

export interface SignalTrigger<OwnRes, Payload = any> {
  signalId: Signal["id"];
  handler: (event: SignalReceived<Payload>) => Result<OwnRes> | void;
}

export function isPromiseTrigger<OwnRes, R>(
  t: Trigger<OwnRes>
): t is PromiseTrigger<OwnRes, R> {
  return "promise" in t;
}

export function isAfterEveryEventTrigger<OwnRes>(
  t: Trigger<OwnRes>
): t is AfterEveryEventTrigger<OwnRes> {
  return "afterEvery" in t;
}

export function isEventTrigger<OwnRes, E extends HistoryResultEvent>(
  t: Trigger<OwnRes>
): t is EventTrigger<OwnRes, E> {
  return "eventType" in t;
}

export function isSignalTrigger<OwnRes, Payload = any>(
  t: Trigger<OwnRes>
): t is SignalTrigger<OwnRes, Payload> {
  return "signalId" in t;
}

interface EventualDefinitionBase {
  /**
   * Commands to emit.
   *
   * When undefined, the eventual will not be checked against an expected event as it does not emit commands.
   */
  generateCommands?: (seq: number) => WorkflowCommand[] | WorkflowCommand;
}

export interface ResolvedEventualDefinition<R> extends EventualDefinitionBase {
  /**
   * When provided, immediately resolves an EventualPromise with a value or error back to the workflow.
   *
   * Commands can still be emitted, but the eventual cannot be triggered.
   */
  result: Result<R>;
}

export interface UnresolvedEventualDefinition<R>
  extends EventualDefinitionBase {
  /**
   * Triggers give the Eventual an opportunity to resolve themselves.
   *
   * Triggers are only called when an eventual is considered to be active.
   */
  triggers: Trigger<R> | (Trigger<R> | undefined)[];
}

export type EventualDefinition<R> =
  | ResolvedEventualDefinition<R>
  | UnresolvedEventualDefinition<R>;

export function isResolvedEventualDefinition<R>(
  eventualDefinition: EventualDefinition<R>
): eventualDefinition is ResolvedEventualDefinition<R> {
  return "result" in eventualDefinition;
}
