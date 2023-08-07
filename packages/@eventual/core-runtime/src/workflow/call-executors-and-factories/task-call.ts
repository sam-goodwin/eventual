import { EventualError, HeartbeatTimeout, Timeout } from "@eventual/core";
import {
  Result,
  WorkflowCallHistoryType,
  WorkflowEventType,
  type CallOutput,
  type TaskCall,
} from "@eventual/core/internal";
import type {
  TaskClient,
  TaskWorkerRequest,
} from "../../clients/task-client.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import type {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";

export class TaskCallWorkflowExecutor
  implements WorkflowCallExecutor<TaskCall>
{
  constructor(private taskClient: TaskClient) {}
  public async executeForWorkflow(
    call: TaskCall,
    { executionTime, workflow, executionId, seq }: WorkflowCallExecutorProps
  ): Promise<any> {
    const request: TaskWorkerRequest = {
      scheduledTime: executionTime.toISOString(),
      workflowName: workflow.name,
      executionId,
      input: call.input,
      taskName: call.name,
      seq,
      heartbeat: call.heartbeat,
      retry: 0,
    };

    await this.taskClient.startTask(request);
  }
}

export class TaskCallEventualFactory implements EventualFactory<TaskCall> {
  public createEventualDefinition(
    call: TaskCall
  ): EventualDefinition<CallOutput<TaskCall>> {
    return {
      triggers: [
        Trigger.onWorkflowEvent(WorkflowEventType.TaskSucceeded, (event) =>
          Result.resolved(event.result)
        ),
        Trigger.onWorkflowEvent(WorkflowEventType.TaskFailed, (event) =>
          Result.failed(new EventualError(event.error, event.message))
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.TaskHeartbeatTimedOut,
          Result.failed(new HeartbeatTimeout("Task Heartbeat TimedOut"))
        ),
        call.timeout
          ? Trigger.onPromiseResolution(
              call.timeout,
              Result.failed(new Timeout("Task Timed Out"))
            )
          : undefined,
      ],
      createCallEvent(seq) {
        return {
          name: call.name,
          seq,
          type: WorkflowCallHistoryType.TaskScheduled,
        };
      },
    };
  }
}
