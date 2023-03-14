import {
  DeterminismError,
  Signal,
  SystemError,
  Workflow,
  WorkflowContext,
  WorkflowTimeout,
} from "@eventual/core";
import {
  CompletionEvent,
  enterWorkflowHookScope,
  EventualCall,
  EventualPromise,
  EventualPromiseSymbol,
  ExecutionWorkflowHook,
  extendsSystemError,
  HistoryEvent,
  HistoryStateEvent,
  isCompletionEvent,
  isScheduledEvent,
  isSignalReceived,
  isWorkflowRunStarted,
  isWorkflowStarted,
  isWorkflowTimedOut,
  iterator,
  Result,
  ScheduledEvent,
  SignalReceived,
  WorkflowEvent,
  WorkflowInputEvent,
  WorkflowRunStarted,
  WorkflowTimedOut,
  _Iterator,
} from "@eventual/core/internal";
import { isPromise } from "util/types";
import { createEventualFromCall, isCorresponding } from "./eventual-factory.js";
import { formatExecutionId } from "./execution.js";
import { isFailed, isResolved, isResult } from "./result.js";
import type { WorkflowCommand } from "./workflow-command.js";
import { filterEvents } from "./workflow-events.js";

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

/**
 * Provide a hooked and labelled promise for all of the {@link Eventual}s.
 *
 * Exposes a resolve method which accepts a {@link Result} object. Adds the seq ID to
 * allow future identification of EventualPromises.
 */
export function createEventualPromise<R>(
  seq: number,
  result?: Result<R>,
  beforeResolve?: () => void
): RuntimeEventualPromise<R> {
  let resolve: ((r: R) => void) | undefined,
    reject: ((reason: any) => void) | undefined;
  const promise = (
    isResult(result)
      ? isResolved(result)
        ? Promise.resolve(result.value)
        : Promise.reject(result.error)
      : new Promise((_resolve, _reject) => {
          resolve = _resolve;
          reject = _reject;
        })
  ) as RuntimeEventualPromise<R>;
  promise[EventualPromiseSymbol] = seq;
  promise.resolve = (result) => {
    beforeResolve?.();
    if (isResolved(result)) {
      resolve?.(result.value);
    } else {
      reject?.(result.error);
    }
  };
  return promise;
}

export class WorkflowExecutor<Input, Output, Context extends any = undefined> {
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
    events: EventTriggerLookup;
    signals: SignalTriggerLookup;
    afterEveryEvent: AfterEveryEventTriggerLookup;
  } = {
    signals: {},
    events: {},
    afterEveryEvent: {},
  };
  /**
   * Iterator containing the in order events we expected to see in a deterministic workflow.
   */
  private expected: _Iterator<HistoryEvent, ScheduledEvent>;
  /**
   * Iterator containing events to apply.
   */
  private events: _Iterator<HistoryEvent, CompletionEvent>;

  /**
   * The state of the current workflow run (start or continue are running).
   *
   * When undefined, the workflow is not running and can be started or accept new events (unless stopped is true).
   */
  private currentRun?: {
    /**
     * When called, resolves the workflow execution with a {@link result}.
     *
     * This will cause the current promise from Executor.start or Executor.continue to resolve with a the given value.
     */
    resolve: (result?: Result) => void;
    /**
     * Commands collected during a workflow run (start or continue method).
     *
     * Cleared and returned when the method's promise resolves.
     */
    commandsToEmit: WorkflowCommand[];
  };
  /**
   * Has the executor ever been started?
   *
   * When false, can call start and not continue.
   * When true, can call continue and not start.
   */
  private started: boolean = false;
  /**
   * True when the executor reached a terminal state, generally a {@link SystemError}.
   */
  private stopped: boolean = false;
  /**
   * The current result of the workflow, also returned by start and continue on completion.
   */
  public result?: Result<Output>;
  private _executionContext?: Context;
  private hooks: {
    /**
     * Callback called when a returned call matches an input event.
     *
     * This call will be ignored.
     */
    historicalEventMatched?: (
      event: WorkflowEvent,
      call: EventualCall,
      context?: Context
    ) => void;

    /**
     * Callback immediately before applying a result event.
     */
    beforeApplyingResultEvent?: (
      resultEvent: CompletionEvent,
      context?: Context
    ) => void;
  } = {};

  constructor(
    private workflow: Workflow<Input, Output>,
    public history: HistoryStateEvent[]
  ) {
    this.nextSeq = 0;
    this.expected = iterator(history, isScheduledEvent);
    this.events = iterator(history, isCompletionEvent);
  }

  get hasActiveEventuals() {
    return Object.keys(this.activeEventuals).length > 0;
  }

  /**
   * Starts an execution.
   *
   * The execution will run until the events are exhausted or the workflow fails.
   *
   * If the input and context are provided, a WorkflowStarted event is not needed in the input events or history.
   * Otherwise a WorkflowStarted event must be in the history or the events passed on start.
   */
  public start(
    ...args:
      | [input: Input, context: WorkflowContext, events?: CompletionEvent[]]
      | [events: WorkflowInputEvent[]]
  ): Promise<WorkflowResult<Output>> {
    if (this.started) {
      throw new Error(
        "Execution has already been started. Use continue to apply new events or create a new Interpreter"
      );
    }
    const self = this;

    const { input, context, events } = processArgs(args);

    this.addHistoryEvents(events ?? []);

    this.started = true;

    // start a workflow run and start the workflow itself.
    return this.startWorkflowRun(() => {
      try {
        this.workflow.definition(input, context).then(
          // successfully completed workflows can continue to retrieve events.
          // TODO: make the behavior of a workflow after success or failure configurable?
          (result) => this.resolveWorkflow(Result.resolved(result)),
          // failed workflows will stop accepting events
          (err) => this.resolveWorkflow(Result.failed(err))
        );
      } catch (err) {
        // handle any synchronous errors.
        this.resolveWorkflow(Result.failed(err));
      }
    });

    function processArgs(
      args:
        | [input: Input, context: WorkflowContext, events?: CompletionEvent[]]
        | [events: WorkflowInputEvent[]]
    ): {
      input: Input;
      context: WorkflowContext;
      events?: WorkflowInputEvent[];
    } {
      if (args.length === 1) {
        // first look for the WorkflowStarted event in the history and then in the recent events.
        const workflowStartEvent =
          self.history.find(isWorkflowStarted) ??
          args[0].find(isWorkflowStarted);

        if (!workflowStartEvent) {
          throw new Error(
            "No WorkflowStarted event was provided in the history or in the start operation. Either provide a WorkflowStarted event or the input/context."
          );
        }

        return {
          input: workflowStartEvent.input,
          context: {
            workflow: { name: workflowStartEvent.workflowName },
            execution: {
              ...workflowStartEvent.context,
              id: formatExecutionId(
                workflowStartEvent.workflowName,
                workflowStartEvent.context.name
              ),
              startTime: workflowStartEvent.timestamp,
              parentId: workflowStartEvent.context.parentId,
            },
          },
          events: args[0],
        };
      } else {
        return {
          input: args[0],
          context: args[1],
          events: args[2],
        };
      }
    }
  }

  /**
   * Continue a previously started workflow by feeding in new {@link CompletionEvent}, possibly advancing the execution.
   *
   * This allows the workflow to continue without re-running previous history.
   *
   * Events will be applied to the workflow in order after being filtered for uniqueness.
   *
   * The execution will run until the events are exhausted or the workflow fails.
   *
   * @returns {@link WorkflowResult} - containing new commands and a result of one was generated.
   */
  public async continue(
    events: WorkflowInputEvent[] | WorkflowInputEvent
  ): Promise<WorkflowResult<Output>> {
    if (!this.started) {
      throw new Error("Execution has not been started, call start first.");
    } else if (this.currentRun) {
      throw new Error(
        "Workflow is already running, await the promise returned by the last start or complete call."
      );
    }

    this.addHistoryEvents(normalizeToArray(events));

    return await this.startWorkflowRun();
  }

  public isStarted() {
    return !!this.started;
  }

  private startWorkflowRun(beforeCommitEvents?: () => void) {
    return this.enterWorkflowHookScope(
      () =>
        new Promise<WorkflowResult<Output>>(async (resolve) => {
          // start context with execution hook
          this.currentRun = {
            resolve: (result) => {
              // let everything that has started or will be started complete
              // set timeout adds the closure to the end of the event loop
              // this assumption breaks down when the user tries to start a promise
              // to accomplish non-deterministic actions like IO.
              process.nextTick(() => {
                const runResult = this.completeCurrentRun(result);
                if (runResult) {
                  resolve(runResult);
                }
              });
            },
            commandsToEmit: [],
          };
          // ensure the workflow hook is available to the workflow
          // and tied to the workflow promise context
          // Also ensure that any handlers like signal handlers returned by the workflow
          // have access to the workflow hook
          beforeCommitEvents?.();
          // APPLY EVENTS
          await this.applyEvents();

          // resolve the promise with the current state.
          this.currentRun?.resolve();
        })
    );
  }

  public get executionContext(): Context | undefined {
    return this._executionContext;
  }

  public setExecutionContext(context: Context) {
    this._executionContext = context;
  }

  /**
   * Overrides the before applying result handler.
   *
   * This handler is called before each event is applied to the workflow.
   */
  public onBeforeApplyingResultEvent(
    handler?: typeof this.hooks.beforeApplyingResultEvent
  ) {
    this.hooks.beforeApplyingResultEvent = handler;
  }

  /**
   * Overrides the historical event matched event.
   *
   * This handler is called when a historical event (ex: scheduled) is matched to a call.
   */
  public onHistoricalEventMatched(
    handler?: typeof this.hooks.historicalEventMatched
  ) {
    this.hooks.historicalEventMatched = handler;
  }

  private addHistoryEvents(newEvents?: WorkflowInputEvent[]) {
    const filteredHistory = newEvents
      ? filterEvents(this.history, newEvents)
      : [];

    this.history.push(...filteredHistory);
  }

  /**
   * Sets the workflow result. When the result is a {@link SystemError}, it
   * halts the workflow.
   */
  private resolveWorkflow(result: Result) {
    if (!this.currentRun) {
      throw new SystemError("Execution is not running.");
    }
    this.result = result;
    if (isFailed(result) && extendsSystemError(result.error)) {
      this.stopped = true;
      this.currentRun.resolve(result);
    }
  }

  /**
   * Returns current result and commands, resetting the command array.
   */
  private completeCurrentRun(
    overrideResult?: Result
  ): WorkflowResult<Output> | undefined {
    if (this.currentRun) {
      const newCommands = this.currentRun.commandsToEmit;
      this.currentRun = undefined;

      this.result = overrideResult ?? this.result;

      return { result: this.result, commands: newCommands };
    }
    return undefined;
  }

  /**
   * Provides a scope where the {@link ExecutionWorkflowHook} is available to the {@link Call}s.
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
            self.currentRun?.commandsToEmit.push(
              ...normalizeToArray(eventual.generateCommands(seq))
            );
          }

          /**
           * If the eventual comes with a result, do not active it, it is already resolved!
           */
          if (isResolvedEventualDefinition(eventual)) {
            return createEventualPromise<any>(
              seq,
              eventual.result
            ) as unknown as E;
          }

          return self.activateEventual(seq, eventual) as E;
        } catch (err) {
          self.resolveWorkflow(Result.failed(err));
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

        self.hooks?.historicalEventMatched?.(
          expected,
          call,
          self._executionContext
        );

        if (!isCorresponding(expected, seq, call)) {
          self.resolveWorkflow(
            Result.failed(
              new DeterminismError(
                `Workflow returned ${JSON.stringify(
                  call
                )}, but ${JSON.stringify(expected)} was expected at ${seq}`
              )
            )
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
  private async applyEvents() {
    while (this.events.hasNext() && !this.stopped) {
      const event = this.events.next()!;
      this.hooks?.beforeApplyingResultEvent?.(event, this._executionContext);
      // We use a promise here because...
      // 1. we want the user code to finish executing before continuing to the next event
      // 2. the promise allows us to use iteration instead of a recursive call stack and depth limits
      await new Promise((resolve) => {
        // this is only needed when using async on immediately resolved promises, like send signal
        process.nextTick(() => {
          this.tryApplyEvent(event);
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
  private tryApplyEvent(event: CompletionEvent) {
    if (isWorkflowTimedOut(event)) {
      return this.resolveWorkflow(
        Result.failed(new WorkflowTimeout("Workflow timed out"))
      );
    } else if (!isWorkflowRunStarted(event)) {
      for (const { seq, handler, args } of this.getHandlersForEvent(event)) {
        // stop calling handler if the workflow is stopped
        // this should only happen on a SystemError
        if (!this.invokeEventualHandler(seq, handler, ...args)) {
          break;
        }
      }
    }
  }

  private invokeEventualHandler<Args extends any[]>(
    seq: number | string,
    handler: TriggerHandler<Args, any>,
    ...args: Args
  ) {
    if (this.stopped) {
      return false;
    }
    if (this.isEventualActive(seq)) {
      try {
        this.tryResolveEventual(
          Number(seq),
          isResult(handler) ? handler : handler(...args) ?? undefined
        );
      } catch {
        // handlers cannot throw and should not impact other handlers
      }
    }
    return true;
  }

  private *getHandlersForEvent(
    event: Exclude<CompletionEvent, WorkflowRunStarted | WorkflowTimedOut>
  ): Generator<TriggerHandlerRef<any>, void, undefined> {
    if (isSignalReceived(event)) {
      const signalHandlers = this.activeHandlers.signals[event.signalId] ?? {};
      yield* Object.entries(signalHandlers).map(([seq, trigger]) => ({
        seq,
        handler: trigger.handler,
        args: [event],
      }));
    } else {
      if (event.seq >= this.nextSeq) {
        // if a workflow history event precedes the call, throw an error.
        // this should never happen if the workflow is deterministic.
        this.resolveWorkflow(
          Result.failed(
            new DeterminismError(`Call for seq ${event.seq} was not emitted.`)
          )
        );
      }
      const eventTrigger = this.activeHandlers.events[event.seq]?.[event.type];
      if (eventTrigger) {
        yield { seq: event.seq, handler: eventTrigger.handler, args: [event] };
      }
    }
    // resolve any eventuals should be triggered on each new event
    yield* Object.entries(this.activeHandlers.afterEveryEvent).map(
      ([seq, trigger]) => ({ seq, handler: trigger.afterEvery, args: [] })
    );
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

  /**
   * @returns true if a seq number matches an active eventual.
   */
  public isEventualActive(seq: number | string) {
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
    // The promise that represents the lifetime of the Eventual.
    const promise = createEventualPromise<any>(seq, undefined, () =>
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
          eventTrigger,
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
          this.invokeEventualHandler(
            seq,
            promiseTrigger.handler,
            Result.resolved(res)
          );
        },
        (err) => {
          this.invokeEventualHandler(
            seq,
            promiseTrigger.handler,
            Result.failed(err)
          );
        }
      );
    });

    /**
     * If the eventual subscribes to a signal, add it to the map.
     */
    const signalTriggers = triggers.filter(isSignalTrigger);
    signalTriggers.forEach((signalTrigger) => {
      (this.activeHandlers.signals[signalTrigger.signalId] ??= {})[seq] =
        signalTrigger;
    });
    // maintain a reference to the signals this eventual is listening for
    // in order to effectively remove the handlers later.
    activeEventual.signals = signalTriggers.map((s) => s.signalId);

    /**
     * If the eventual should be invoked after each event is applied, add it to the set.
     */
    const [afterEventHandler] = triggers.filter(isAfterEveryEventTrigger);
    if (afterEventHandler) {
      this.activeHandlers.afterEveryEvent[seq] = afterEventHandler;
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

function normalizeToArray<T>(items: T | T[]): T[] {
  return Array.isArray(items) ? items : [items];
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

export type Trigger<Output> =
  | PromiseTrigger<Output>
  | EventTrigger<Output>
  | AfterEveryEventTrigger<Output>
  | SignalTrigger<Output>;

export const Trigger = {
  onPromiseResolution: <Output = any, Input = any>(
    promise: Promise<Input>,
    handler: PromiseTrigger<Output, Input>["handler"]
  ): PromiseTrigger<Output, Input> => {
    return {
      promise,
      handler,
    };
  },
  afterEveryEvent: <Output = any>(
    handler: AfterEveryEventTrigger<Output>["afterEvery"]
  ): AfterEveryEventTrigger<Output> => {
    return {
      afterEvery: handler,
    };
  },
  onWorkflowEvent: <Output = any, T extends CompletionEvent["type"] = any>(
    eventType: T,
    handler: EventTrigger<Output, CompletionEvent & { type: T }>["handler"]
  ): EventTrigger<Output, CompletionEvent & { type: T }> => {
    return {
      eventType,
      handler,
    };
  },
  onSignal: <Output = any, Payload = any>(
    signalId: Signal<Payload>["id"],
    handler: SignalTrigger<Output, Payload>["handler"]
  ): SignalTrigger<Output, Payload> => {
    return {
      signalId,
      handler,
    };
  },
};

type TriggerHandler<Args extends any[], Output> =
  | {
      (...args: Args): void | undefined | Result<Output>;
    }
  | Result<Output>;

export interface PromiseTrigger<Output, Input = any> {
  promise: Promise<Input>;
  handler: TriggerHandler<[val: Result<Input>], Output>;
}

export interface AfterEveryEventTrigger<Output> {
  afterEvery: TriggerHandler<[], Output>;
}

export interface EventTrigger<
  out Output = any,
  E extends CompletionEvent = any
> {
  eventType: E["type"];
  handler: TriggerHandler<[event: E], Output>;
}

export interface SignalTrigger<Output, Payload = any> {
  signalId: Signal["id"];
  handler: TriggerHandler<[event: SignalReceived<Payload>], Output>;
}

export function isPromiseTrigger<Output, R>(
  t: Trigger<Output>
): t is PromiseTrigger<Output, R> {
  return "promise" in t;
}

export function isAfterEveryEventTrigger<Output>(
  t: Trigger<Output>
): t is AfterEveryEventTrigger<Output> {
  return "afterEvery" in t;
}

export function isEventTrigger<Output, E extends CompletionEvent>(
  t: Trigger<Output>
): t is EventTrigger<Output, E> {
  return "eventType" in t;
}

export function isSignalTrigger<Output, Payload = any>(
  t: Trigger<Output>
): t is SignalTrigger<Output, Payload> {
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

interface TriggerHandlerRef<Args extends any[]> {
  seq: number | string;
  handler: TriggerHandler<Args, any>;
  args: Args;
}

interface EventTriggerLookup
  extends Record<number, Record<string, EventTrigger<any, any>>> {}
interface SignalTriggerLookup
  extends Record<string, Record<number, SignalTrigger<any>>> {}
interface AfterEveryEventTriggerLookup
  extends Record<number, AfterEveryEventTrigger<any>> {}
