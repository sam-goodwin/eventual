import {
  WorkflowEventType,
  type AwaitTimerCall,
  type TimerCompleted,
} from "@eventual/core/internal";
import type { TimerClient } from "../../clients/timer-client.js";
import type {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";

export class AwaitTimerWorkflowExecutor
  implements WorkflowCallExecutor<AwaitTimerCall>
{
  constructor(private timerClient: TimerClient) {}

  public async executeForWorkflow(
    call: AwaitTimerCall,
    { seq, executionId }: WorkflowCallExecutorProps
  ): Promise<void> {
    await this.timerClient.scheduleEvent<TimerCompleted>({
      event: {
        type: WorkflowEventType.TimerCompleted,
        seq,
      },
      schedule: call.schedule,
      executionId,
    });
  }
}
