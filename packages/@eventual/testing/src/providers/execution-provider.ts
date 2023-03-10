import { WorkflowExecutor } from "@eventual/core-runtime";
import { HistoryStateEvent } from "@eventual/core/internal";
import {
  ExecutionExecutorProvider,
  ExecutorContext,
} from "../handlers/local-orchestrator.js";

export class LocalExecutionProvider
  implements ExecutionExecutorProvider<ExecutorContext>
{
  private executions: Record<
    string,
    WorkflowExecutor<any, any, ExecutorContext>
  > = {};

  getRunningExecution(
    executionId: string
  ): Promise<WorkflowExecutor<any, any, ExecutorContext> | undefined> {
    return Promise.resolve(this.executions[executionId]);
  }

  async persistExecution(
    executionId: string,
    // a local workflow doesn't need to persist events
    _commandEvents: HistoryStateEvent[],
    executor: WorkflowExecutor<any, any, ExecutorContext>
  ): Promise<void> {
    this.executions[executionId] = executor;
  }
}
