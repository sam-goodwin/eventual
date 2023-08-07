import {
  WorkflowCallHistoryType,
  WorkflowEventType,
  type AwaitTimerCall,
  type TimerCompleted,
} from "@eventual/core/internal";
import type { TimerClient } from "../../clients/timer-client.js";
import { EventualFactory } from "../call-eventual-factory.js";
import type {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";
import { Result } from "../../result.js";

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

export class AwaitTimerClassEventualFactory
  implements EventualFactory<AwaitTimerCall>
{
  public initializeEventual(call: AwaitTimerCall): EventualDefinition<void> {
    return {
      triggers: Trigger.onWorkflowEvent(
        WorkflowEventType.TimerCompleted,
        Result.resolved(undefined)
      ),
      createCallEvent: (seq) => ({
        type: WorkflowCallHistoryType.TimerScheduled,
        seq,
        schedule: call.schedule,
      }),
    };
  }
}
