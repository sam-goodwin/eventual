import { HistoryStateEvent } from "@eventual/core/internal";
import { ExecutionHistoryStateStore } from "../stores/execution-history-state-store.js";
import { WorkflowExecutor } from "../workflow-executor.js";

export interface ExecutorProvider<Context extends any = undefined> {
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
  ): Promise<void>;
}

export interface RemoteExecutorProviderProps {
  executionHistoryStateStore: ExecutionHistoryStateStore;
}

/**
 * An executor provider that works with an out of memory store.
 */
export class RemoteExecutorProvider<Context extends any = undefined>
  implements ExecutorProvider<Context>
{
  constructor(private props: RemoteExecutorProviderProps) {}

  async getExecutor(
    executionId: string,
    initExecutor: (
      history: HistoryStateEvent[]
    ) => WorkflowExecutor<any, any, Context>
  ): Promise<any> {
    const history = await this.props.executionHistoryStateStore.getHistory(
      executionId
    );
    console.log(history);
    return initExecutor(history);
  }

  async persistExecution(
    executionId: string,
    newHistoryEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any, any>
  ): Promise<void> {
    // provides a shallow copy of the history events.
    const historyEvents = executor.historyEvents;
    historyEvents.push(...newHistoryEvents);
    await this.props.executionHistoryStateStore.updateHistory({
      executionId,
      events: historyEvents,
    });
  }
}

export class InMemoryExecutorProvider<Context extends any = undefined>
  implements ExecutorProvider<Context>
{
  private executions: Record<string, WorkflowExecutor<any, any, Context>> = {};

  getExecutor(
    executionId: string,
    initializeNewExecutor: (
      history: HistoryStateEvent[]
    ) => WorkflowExecutor<any, any, Context>
  ): Promise<WorkflowExecutor<any, any, Context>> {
    return Promise.resolve(
      this.executions[executionId] ?? initializeNewExecutor([])
    );
  }

  async persistExecution(
    executionId: string,
    _newEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any, any>
  ): Promise<void> {
    this.executions[executionId] = executor;
  }
}
