import {
  WorkflowCallHistoryType,
  isChildExecutionTarget,
  type SendSignalCall,
} from "@eventual/core/internal";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import type {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";
import type { EventualDefinition } from "../eventual-definition.js";
import { formatChildExecutionName, formatExecutionId } from "../execution.js";
import { Result } from "../../result.js";

export class SendSignalWorkflowCallExecutor
  implements WorkflowCallExecutor<SendSignalCall>
{
  constructor(private executionQueueClient: ExecutionQueueClient) {}

  public async executeForWorkflow(
    call: SendSignalCall,
    { executionId, seq }: WorkflowCallExecutorProps
  ): Promise<void> {
    const childExecutionId = isChildExecutionTarget(call.target)
      ? formatExecutionId(
          call.target.workflowName,
          formatChildExecutionName(executionId, call.target.seq)
        )
      : call.target.executionId;

    await this.executionQueueClient.sendSignal({
      signal: call.signalId,
      execution: childExecutionId,
      id: `${executionId}/${seq}`,
      payload: call.payload,
    });
  }
}

export class SendSignalEventualFactory
  implements EventualFactory<SendSignalCall>
{
  /**
   * There are no incoming events for {@link SendSignalCall}s.
   *
   * Just create the event and return undefined.
   */
  public initializeEventual(call: SendSignalCall): EventualDefinition<void> {
    return {
      createCallEvent(seq) {
        return {
          type: WorkflowCallHistoryType.SignalSent,
          target: call.target,
          signalId: call.signalId,
          seq,
          payload: call.payload,
        };
      },
      result: Result.resolved(undefined),
    };
  }
}
