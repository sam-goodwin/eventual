import type { HistoryStateEvent } from "@eventual/core/internal";
import type { ExecutionHistoryStateStore } from "../stores/execution-history-state-store.js";
import type { WorkflowExecutor } from "../workflow-executor.js";

export interface ExecutorProvider<Context = undefined> {
  /**
   * Returns an executor which may already be started.
   *
   * Use {@link WorkflowExecutor}.isStarted to determine if it is already started.
   */
  getExecutor(
    executionId: string,
    /**
     * Called with the history retrieved to initialize the executor.
     */
    initializeNewExecutor: (
      history: HistoryStateEvent[]
    ) => WorkflowExecutor<any, any, Context>
  ): Promise<WorkflowExecutor<any, any, Context>>;
  persistExecution(
    executionId: string,
    newEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any, any>
  ): Promise<{ storedBytes: number }>;
}

export interface RemoteExecutorProviderProps {
  executionHistoryStateStore: ExecutionHistoryStateStore;
}

/**
 * An executor provider that works with an out of memory store.
 */
export class RemoteExecutorProvider<Context = undefined>
  implements ExecutorProvider<Context>
{
  constructor(private props: RemoteExecutorProviderProps) {}

  public async getExecutor(
    executionId: string,
    initExecutor: (
      history: HistoryStateEvent[]
    ) => WorkflowExecutor<any, any, Context>
  ): Promise<any> {
    const history = await this.props.executionHistoryStateStore.getHistory(
      executionId
    );
    return initExecutor(history);
  }

  public async persistExecution(
    executionId: string,
    newHistoryEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any, any>
  ): Promise<{ storedBytes: number }> {
    // provides a shallow copy of the history events.
    const historyEvents = executor.history.slice(0);
    historyEvents.push(...newHistoryEvents);
    const { bytes } = await this.props.executionHistoryStateStore.updateHistory(
      {
        executionId,
        events: historyEvents,
      }
    );
    return { storedBytes: bytes };
  }
}

export class InMemoryExecutorProvider<Context = undefined>
  implements ExecutorProvider<Context>
{
  private executions: Record<string, WorkflowExecutor<any, any, Context>> = {};

  public getExecutor(
    executionId: string,
    initializeNewExecutor: (
      history: HistoryStateEvent[]
    ) => WorkflowExecutor<any, any, Context>
  ): Promise<WorkflowExecutor<any, any, Context>> {
    return Promise.resolve(
      (this.executions[executionId] ??= initializeNewExecutor([]))
    );
  }

  public async persistExecution(
    executionId: string,
    _newEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any, any>
  ): Promise<{ storedBytes: number }> {
    this.executions[executionId] = executor;
    return { storedBytes: 0 };
  }
}
