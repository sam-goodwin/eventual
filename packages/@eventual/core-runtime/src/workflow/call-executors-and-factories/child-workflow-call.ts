import { EventualError } from "@eventual/core";
import {
  Result,
  WorkflowCallHistoryType,
  WorkflowEventType,
  isChildWorkflowCall,
  type ChildWorkflowCall,
  type GetExecutionCall,
  type StartWorkflowCall,
} from "@eventual/core/internal";
import type { WorkflowClient } from "../../clients/workflow-client.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import type {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";
import { formatChildExecutionName } from "../execution.js";

export class ChildWorkflowCallWorkflowExecutor
  implements WorkflowCallExecutor<ChildWorkflowCall>
{
  constructor(private workflowClient: WorkflowClient) {}

  /**
   * TODO: support {@link GetExecutionCall} and {@link StartWorkflowCall}.
   */
  public async executeForWorkflow(
    call: ChildWorkflowCall,
    { executionId, seq }: WorkflowCallExecutorProps
  ): Promise<void> {
    if (isChildWorkflowCall(call)) {
      await this.workflowClient.startExecution({
        workflow: call.name,
        input: call.input,
        parentExecutionId: executionId,
        executionName: formatChildExecutionName(executionId, seq),
        seq,
        ...call.opts,
      });
    }
  }
}

export class ChildWorkflowCallEventualFactory
  implements EventualFactory<ChildWorkflowCall>
{
  public createEventualDefinition(
    call: ChildWorkflowCall
  ): EventualDefinition<any> {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.ChildWorkflowSucceeded,
          (event) => Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.ChildWorkflowFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
        call.timeout
          ? Trigger.onPromiseResolution(
              call.timeout,
              Result.failed("Child Workflow Timed Out")
            )
          : undefined,
      ],
      createCallEvent(seq) {
        return {
          type: WorkflowCallHistoryType.ChildWorkflowScheduled,
          name: call.name,
          seq,
          input: call.input,
        };
      },
    };
  }
}
