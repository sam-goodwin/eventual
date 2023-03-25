import { ExecutionID, Workflow } from "@eventual/core";
import {
  ActivityCall,
  ActivityScheduled,
  assertNever,
  AwaitTimerCall,
  ChildWorkflowCall,
  ChildWorkflowScheduled,
  EventsPublished,
  HistoryStateEvent,
  isActivityCall,
  isAwaitTimerCall,
  isChildExecutionTarget,
  isChildWorkflowCall,
  isConditionCall,
  isExpectSignalCall,
  isPublishEventsCall,
  isRegisterSignalHandlerCall,
  isSendSignalCall,
  PublishEventsCall,
  SendSignalCall,
  SignalSent,
  TimerCompleted,
  TimerScheduled,
  WorkflowEventType,
} from "@eventual/core/internal";
import {
  ActivityClient,
  ActivityWorkerRequest,
} from "./clients/activity-client.js";
import { EventClient } from "./clients/event-client.js";
import { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import { TimerClient } from "./clients/timer-client.js";
import { WorkflowClient } from "./clients/workflow-client.js";
import { formatChildExecutionName, formatExecutionId } from "./execution.js";
import { computeScheduleDate } from "./schedule.js";
import { createEvent } from "./workflow-events.js";
import { WorkflowCall } from "./workflow-executor.js";

interface WorkflowCallExecutorProps {
  timerClient: TimerClient;
  workflowClient: WorkflowClient;
  executionQueueClient: ExecutionQueueClient;
  eventClient: EventClient;
  activityClient: ActivityClient;
}

/**
 * Uses the clients to execute all supported calls and return events.
 */
export class WorkflowCallExecutor {
  constructor(private props: WorkflowCallExecutorProps) {}

  public async executeCall(
    workflow: Workflow,
    executionId: ExecutionID,
    call: WorkflowCall,
    baseTime: Date
  ): Promise<HistoryStateEvent | undefined> {
    if (isActivityCall(call.call)) {
      return await this.scheduleActivity(
        workflow,
        executionId,
        call.call,
        call.seq,
        baseTime
      );
    } else if (isChildWorkflowCall(call.call)) {
      return this.scheduleChildWorkflow(
        executionId,
        call.call,
        call.seq,
        baseTime
      );
    } else if (isAwaitTimerCall(call.call)) {
      // all timers are computed using the start time of the WorkflowTaskStarted
      return this.startTimer(executionId, call.call, call.seq, baseTime);
    } else if (isSendSignalCall(call.call)) {
      return this.sendSignal(executionId, call.call, call.seq, baseTime);
    } else if (isPublishEventsCall(call.call)) {
      return this.publishEvents(call.call, call.seq, baseTime);
    } else if (
      isConditionCall(call.call) ||
      isExpectSignalCall(call.call) ||
      isRegisterSignalHandlerCall(call.call)
    ) {
      // do nothing
      return undefined;
    } else {
      return assertNever(call.call, `unknown call type`);
    }
  }

  private async scheduleActivity(
    workflow: Workflow,
    executionId: string,
    call: ActivityCall,
    seq: number,
    baseTime: Date
  ) {
    const request: ActivityWorkerRequest = {
      scheduledTime: baseTime.toISOString(),
      workflowName: workflow.name,
      executionId,
      input: call.input,
      activityName: call.name,
      seq,
      heartbeat: call.heartbeat,
      retry: 0,
    };

    await this.props.activityClient.startActivity(request);

    return createEvent<ActivityScheduled>(
      {
        type: WorkflowEventType.ActivityScheduled,
        seq,
        name: call.name,
      },
      baseTime
    );
  }

  private async scheduleChildWorkflow(
    executionId: ExecutionID,
    call: ChildWorkflowCall,
    seq: number,
    baseTime: Date
  ): Promise<ChildWorkflowScheduled> {
    await this.props.workflowClient.startExecution({
      workflow: call.name,
      input: call.input,
      parentExecutionId: executionId,
      executionName: formatChildExecutionName(executionId, seq),
      seq,
      ...call.opts,
    });

    return createEvent<ChildWorkflowScheduled>(
      {
        type: WorkflowEventType.ChildWorkflowScheduled,
        seq,
        name: call.name,
        input: call.input,
      },
      baseTime
    );
  }

  private async startTimer(
    executionId: string,
    call: AwaitTimerCall,
    seq: number,
    baseTime: Date
  ): Promise<TimerScheduled> {
    // TODO validate
    await this.props.timerClient.scheduleEvent<TimerCompleted>({
      event: {
        type: WorkflowEventType.TimerCompleted,
        seq,
      },
      schedule: call.schedule,
      executionId,
    });

    return createEvent<TimerScheduled>(
      {
        type: WorkflowEventType.TimerScheduled,
        seq,
        untilTime: computeScheduleDate(call.schedule, baseTime).toISOString(),
      },
      baseTime
    );
  }

  private async sendSignal(
    executionId: string,
    call: SendSignalCall,
    seq: number,
    baseTime: Date
  ) {
    const childExecutionId = isChildExecutionTarget(call.target)
      ? formatExecutionId(
          call.target.workflowName,
          formatChildExecutionName(executionId, call.target.seq)
        )
      : call.target.executionId;

    await this.props.executionQueueClient.sendSignal({
      signal: call.signalId,
      execution: childExecutionId,
      id: `${executionId}/${seq}`,
      payload: call.payload,
    });

    return createEvent<SignalSent>(
      {
        type: WorkflowEventType.SignalSent,
        executionId: childExecutionId,
        seq,
        signalId: call.signalId,
        payload: call.payload,
      },
      baseTime
    );
  }

  private async publishEvents(
    call: PublishEventsCall,
    seq: number,
    baseTime: Date
  ) {
    await this.props.eventClient.publishEvents(...call.events);
    return createEvent<EventsPublished>(
      {
        type: WorkflowEventType.EventsPublished,
        events: call.events,
        seq,
      },
      baseTime
    );
  }
}
