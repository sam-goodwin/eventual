import {
  DeterminismError,
  Timeout,
  Workflow,
  WorkflowContext,
} from "@eventual/core";
import {
  assertNever,
  createEventualPromise,
  EventualCall,
  EventualPromise,
  HistoryEvent,
  HistoryResultEvent,
  HistoryScheduledEvent,
  isFailed,
  isResolved,
  isResultEvent,
  isScheduledEvent,
  isSignalReceived,
  isWorkflowRunStarted,
  isWorkflowTimedOut,
  iterator,
  registerWorkflowHook,
  Result,
  WorkflowCommand,
  WorkflowEvent,
  WorkflowRunStarted,
  WorkflowTimedOut,
  _Iterator,
} from "@eventual/core/internal";
import { isPromise } from "util/types";
import { createEventualFromCall, isCorresponding } from "./eventual-factory.js";

interface ActiveEventual<R = any> {
  resolve: (result: R) => void;
  reject: (reason: any) => void;
  promise: EventualPromise<R>;
  eventual: Eventual<R>;
}

interface RuntimeState {
  /**
   * All {@link Eventual} waiting on a sequence based result event.
   */
  active: Record<number, ActiveEventual>;
  /**
   * All {@link Eventual}s waiting on a signal.
   */
  awaitingSignals: Record<string, Set<number>>;
  /**
   * All {@link Eventual}s which should be invoked on every new event.
   *
   * For example, Condition should be checked after applying any event.
   */
  awaitingAny: Set<number>;
  /**
   * Iterator containing the in order events we expected to see in a deterministic workflow.
   */
  expected: _Iterator<HistoryEvent, HistoryScheduledEvent>;
  /**
   * Iterator containing events to apply.
   */
  events: _Iterator<HistoryEvent, HistoryResultEvent>;
}

interface DependencyHandler<R, OwnR> {
  promise: Promise<R>;
  handler: (val: Result<R>) => Result<OwnR> | undefined;
}

export interface Eventual<R> {
  /**
   * Invoke this handler every time a new event is applied, in seq order.
   */
  afterEveryEvent?: () => Result<R> | undefined;
  signals?: string[] | string;
  /**
   * When an promise completes, call the handler on this eventual.
   *
   * Useful for things like activities, which use other {@link Eventual}s to cancel/timeout.
   */
  dependencies?: DependencyHandler<any, R>[] | DependencyHandler<any, R>;
  /**
   * When an event comes in that matches this eventual's sequence,
   * pass the event to the eventual if not already resolved.
   */
  applyEvent?: (event: HistoryEvent) => Result<R> | undefined;
  /**
   * Commands to emit.
   *
   * When undefined, the eventual will not be checked against an expected event as it does not emit commands.
   */
  generateCommands?: (seq: number) => WorkflowCommand[] | WorkflowCommand;
  seq: number;
  result?: Result<R>;
}

function initializeRuntimeState(historyEvents: HistoryEvent[]): RuntimeState {
  return {
    active: {},
    awaitingSignals: {},
    awaitingAny: new Set(),
    expected: iterator(historyEvents, isScheduledEvent),
    events: iterator(historyEvents, isResultEvent),
  };
}

/**
 * 1. get hook - getEventualHook
 * 2. register - register eventual call
 *    a. create eventual with handlers and callbacks
 *    b. check for completion - the eventual can choose to end early, for example, a condition
 *    c. create promise
 *    d. register eventual with the executor
 *    e. return promise
 * 3. return promise to caller/workflow
 */

interface ExecutorOptions {
  /**
   * When false, the workflow will auto-cancel when it has exhausted all history events provided
   * during {@link start}.
   *
   * When true, use {@link continue} to provide more history events.
   */
  resumable?: boolean;
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
  private seq: number;
  private runtimeState: RuntimeState;
  private started?: {
    resolve: (result: Result) => void;
  };
  private commandsToEmit: WorkflowCommand[];
  public result?: Result<Output>;

  constructor(
    private workflow: Workflow<Input, Output>,
    private history: HistoryEvent[],
    private options?: ExecutorOptions
  ) {
    this.seq = 0;
    this.runtimeState = initializeRuntimeState(history);
    this.commandsToEmit = [];
  }

  public start(
    input: Input,
    context: WorkflowContext
  ): Promise<WorkflowResult<Output>> {
    if (this.started) {
      throw new Error(
        "Execution has already been started. If resumable is on, use continue to apply new events or create a new Interpreter"
      );
    }

    return new Promise(async (resolve) => {
      // start context with execution hook
      this.registerExecutionHook();
      this.started = {
        // TODO, also cancel?
        resolve: (result) => {
          const newCommands = this.commandsToEmit;
          this.commandsToEmit = [];

          resolve({ commands: newCommands, result });
        },
      };
      try {
        const workflowPromise = this.workflow.definition(input, context);
        workflowPromise.then(
          (result) => this.forceComplete(Result.resolved(result)),
          (err) => this.forceComplete(Result.failed(err))
        );
      } catch (err) {
        // handle any synchronous errors.
        this.forceComplete(Result.failed(err));
      }

      // APPLY EVENTS
      await this.drainHistoryEvents();

      // let everything that has started or will be started complete
      setTimeout(() => {
        const newCommands = this.commandsToEmit;
        this.commandsToEmit = [];

        if (!this.result && !this.options?.resumable) {
          // cancel promises?
          if (this.runtimeState.expected.hasNext()) {
            this.forceComplete(
              Result.failed(
                new DeterminismError(
                  "Workflow did not return expected commands"
                )
              )
            );
          }
        }

        resolve({
          commands: newCommands,
          result: this.result,
        });
      });
    });
  }

  public async continue(
    ...history: HistoryEvent[]
  ): Promise<WorkflowResult<Output>> {
    if (!this.options?.resumable) {
      throw new Error(
        "Cannot continue an execution unless resumable is set to true."
      );
    } else if (!this.started) {
      throw new Error("Execution has not been started, call start first.");
    }

    this.history.push(...history);

    return new Promise(async (resolve) => {
      this.registerExecutionHook();
      await this.drainHistoryEvents();

      const newCommands = this.commandsToEmit;
      this.commandsToEmit = [];

      resolve({
        commands: newCommands,
        result: this.result,
      });
    });
  }

  private forceComplete(result: Result) {
    if (!this.started) {
      throw new Error("Execution is not started.");
    }
    this.started.resolve(result);
  }

  private registerExecutionHook() {
    const self = this;
    registerWorkflowHook({
      registerEventualCall: (call) => {
        try {
          const eventual = createEventualFromCall(call);
          const seq = this.seq++;

          // if the call is new, generate and emit it's commands
          // if the eventual does not generate commands, do not check it against the expected events.
          if (eventual.generateCommands && !isExpectedCall(seq, call)) {
            this.commandsToEmit.push(
              ...normalizeToArray(eventual.generateCommands(seq))
            );
          }

          /**
           * If the eventual comes with a result, do not active it, it is already resolved!
           */
          if (eventual.result) {
            return createEventualPromise(
              isResolved(eventual.result)
                ? Promise.resolve(eventual.result.value)
                : Promise.reject(eventual.result.error),
              seq
            );
          }

          const activeEventual = this.activateEventual({ ...eventual, seq });

          /**
           * For each dependency, wire the dependency promise to the handler provided by the eventual.
           *
           * If the dependency resolves or rejects, pass the result along.
           */
          const deps = normalizeToArray(eventual.dependencies);
          deps.forEach((dep) => {
            (!isPromise(dep.promise)
              ? Promise.resolve(dep.promise)
              : dep.promise
            ).then(
              (res) => {
                this.tryResolveEventual(seq, dep.handler(Result.resolved(res)));
              },
              (err) => {
                this.tryResolveEventual(seq, dep.handler(Result.failed(err)));
              }
            );
          });

          return activeEventual.promise;
        } catch (err) {
          this.forceComplete(Result.failed(err));
          throw err;
        }
      },
      resolveEventual: (seq, result) => {
        this.tryResolveEventual(seq, result);
      },
    });

    /**
     * Checks the call against the expected events.
     * @returns false if the call is new and true if the call matches the expected events.
     * @throws {@link DeterminismError} when the call is not expected and there are expected events remaining.
     */
    function isExpectedCall(seq: number, call: EventualCall) {
      if (self.runtimeState.expected.hasNext()) {
        const expected = self.runtimeState.expected.next()!;

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

  private async drainHistoryEvents() {
    while (this.runtimeState.events.hasNext() && !this.result) {
      const event = this.runtimeState.events.next()!;
      this.options?.hooks?.beforeApplyingResultEvent?.(event);
      await new Promise((resolve) => {
        setTimeout(() => {
          this.tryCommitResultEvent(event);
          resolve(undefined);
        });
      });
      // TODO: do we need to use setTimeout here to go to the end of the event loop?
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
      this.forceComplete(Result.failed(new Timeout("Workflow timed out")));
      // TODO cancel workflow?
    } else if (!isWorkflowRunStarted(event)) {
      const eventuals = this.getEventualsForEvent(event);
      for (const eventual of eventuals ?? []) {
        // pass event to the eventual
        this.tryResolveEventual(
          eventual.eventual.seq,
          eventual.eventual.applyEvent?.(event)
        );
      }
      [...this.runtimeState.awaitingAny].map((s) => {
        const eventual = this.runtimeState.active[s];
        if (eventual && eventual.eventual.afterEveryEvent) {
          this.tryResolveEventual(s, eventual.eventual.afterEveryEvent());
        }
      });
    }
  }

  private tryResolveEventual<R>(
    seq: number,
    result: Result<R> | undefined
  ): void {
    if (result) {
      const eventual = this.runtimeState.active[seq];
      if (eventual) {
        // deactivate the eventual to avoid a circular resolution
        this.deactivateEventual(eventual.eventual);
        // TODO: remove from signal listens
        if (isResolved(result)) {
          eventual.resolve(result.value);
        } else if (isFailed(result)) {
          eventual.reject(result.error);
        } else {
          return assertNever(result);
        }
      }
    }
  }

  private getEventualsForEvent(
    event: Exclude<HistoryResultEvent, WorkflowTimedOut | WorkflowRunStarted>
  ): ActiveEventual[] | undefined {
    if (isSignalReceived(event)) {
      return [...(this.runtimeState.awaitingSignals[event.signalId] ?? [])]
        ?.map((seq) => this.getActiveEventual(seq))
        .filter((envt): envt is ActiveEventual => !!envt);
    } else {
      const eventual = this.runtimeState.active[event.seq];
      // no more active Eventuals for this seq, ignore it
      if (!eventual) {
        return [];
      } else {
        return [eventual];
      }
    }
  }

  private getActiveEventual(seq: number): ActiveEventual | undefined {
    return this.runtimeState.active[seq];
  }

  /**
   * Apply the eventual to the runtime state.
   * An active eventual can be resolved and waited on, it is yet to have a resolve.
   *
   * Roughly the opposite of {@link deactivateEventual}.
   */
  private activateEventual(eventual: Eventual<any>): ActiveEventual {
    /**
     * The promise that represents
     */
    let reject: any, resolve: any;
    const promise = createEventualPromise(
      new Promise((r, rr) => {
        resolve = r;
        reject = rr;
      }),
      eventual.seq
    );

    const activeEventual: ActiveEventual = {
      resolve,
      reject,
      promise,
      eventual,
    };

    /**
     * Add the eventual to the active eventual collection.
     *
     * This is how we determine which eventuals are active.
     */
    this.runtimeState.active[eventual.seq] = activeEventual;

    /**
     * If the eventual subscribes to a signal, add it to the map.
     */
    if (eventual.signals) {
      const signals = new Set(normalizeToArray(eventual.signals));
      [...signals].map((signal) => {
        if (!(signal in this.runtimeState.awaitingSignals)) {
          this.runtimeState.awaitingSignals[signal] = new Set();
        }
        this.runtimeState.awaitingSignals[signal]!.add(eventual.seq);
      });
    }

    /**
     * If the eventual should be invoked after each event is applied, add it to the set.
     */
    if (eventual.afterEveryEvent) {
      this.runtimeState.awaitingAny.add(eventual.seq);
    }

    return activeEventual;
  }

  /**
   * Remove an eventual from the runtime state.
   * An inactive eventual has already been resolved and has a result.
   *
   * Roughly the opposite of {@link activateEventual}.
   */
  private deactivateEventual(eventual: Eventual<any>) {
    // if the eventual is has a result, immediately remove it
    delete this.runtimeState.active[eventual.seq];
    this.runtimeState.awaitingAny.delete(eventual.seq);
    if (eventual.signals) {
      const signals = normalizeToArray(eventual.signals);
      signals.forEach((signal) =>
        this.runtimeState.awaitingSignals[signal]?.delete(eventual.seq)
      );
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
