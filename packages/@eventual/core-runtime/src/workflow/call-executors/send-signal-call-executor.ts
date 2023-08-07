import {
  SendSignalCall,
  isChildExecutionTarget,
} from "@eventual/core/internal";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { formatChildExecutionName, formatExecutionId } from "../execution.js";
import {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";

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
