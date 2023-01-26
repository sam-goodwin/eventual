import {
  Command,
  isPublishEventsCommand,
  isScheduleActivityCommand,
  isScheduleWorkflowCommand,
  isSendSignalCommand,
  isStartTimerCommand,
  PublishEventsCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
  SendSignalCommand,
  StartTimerCommand,
} from "../command.js";
import { computeScheduleDate } from "../schedule.js";
import { isChildExecutionTarget } from "../signals.js";
import { assertNever } from "../util.js";
import {
  ActivityScheduled,
  ChildWorkflowScheduled,
  createEvent,
  EventsPublished,
  HistoryStateEvent,
  SignalSent,
  TimerCompleted,
  TimerScheduled,
  WorkflowEventType,
} from "../workflow-events.js";
import { Workflow } from "../workflow.js";
import {
  ActivityClient,
  ActivityWorkerRequest,
} from "./clients/activity-client.js";
import { EventClient } from "./clients/event-client.js";
import { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import { TimerClient } from "./clients/timer-client.js";
import { WorkflowClient } from "./clients/workflow-client.js";
import { formatChildExecutionName, formatExecutionId } from "./execution-id.js";

interface CommandExecutorProps {
  timerClient: TimerClient;
  workflowClient: WorkflowClient;
  executionQueueClient: ExecutionQueueClient;
  eventClient: EventClient;
  activityClient: ActivityClient;
}

/**
 * Uses the clients to execute all supported commands and return events.
 */
export class CommandExecutor {
  constructor(private props: CommandExecutorProps) {}

  public async executeCommand(
    workflow: Workflow,
    executionId: string,
    command: Command,
    baseTime: Date
  ): Promise<HistoryStateEvent> {
    if (isScheduleActivityCommand(command)) {
      return await this.scheduleActivity(
        workflow,
        executionId,
        command,
        baseTime
      );
    } else if (isScheduleWorkflowCommand(command)) {
      return this.scheduleChildWorkflow(executionId, command, baseTime);
    } else if (isStartTimerCommand(command)) {
      // all timers are computed using the start time of the WorkflowTaskStarted
      return this.startTimer(executionId, command, baseTime);
    } else if (isSendSignalCommand(command)) {
      return this.sendSignal(executionId, command, baseTime);
    } else if (isPublishEventsCommand(command)) {
      return this.publishEvents(command, baseTime);
    } else {
      return assertNever(command, `unknown command type`);
    }
  }

  private async scheduleActivity(
    workflow: Workflow,
    executionId: string,
    command: ScheduleActivityCommand,
    baseTime: Date
  ) {
    const request: ActivityWorkerRequest = {
      scheduledTime: baseTime.toISOString(),
      workflowName: workflow.workflowName,
      executionId,
      command,
      retry: 0,
    };

    await this.props.activityClient.startActivity(request);

    return createEvent<ActivityScheduled>(
      {
        type: WorkflowEventType.ActivityScheduled,
        seq: command.seq,
        name: command.name,
      },
      baseTime
    );
  }

  private async scheduleChildWorkflow(
    executionId: string,
    command: ScheduleWorkflowCommand,
    baseTime: Date
  ): Promise<ChildWorkflowScheduled> {
    await this.props.workflowClient.startExecution({
      workflow: command.name,
      input: command.input,
      parentExecutionId: executionId,
      executionName: formatChildExecutionName(executionId, command.seq),
      seq: command.seq,
      ...command.opts,
    });

    return createEvent<ChildWorkflowScheduled>(
      {
        type: WorkflowEventType.ChildWorkflowScheduled,
        seq: command.seq,
        name: command.name,
        input: command.input,
      },
      baseTime
    );
  }

  private async startTimer(
    executionId: string,
    command: StartTimerCommand,
    baseTime: Date
  ): Promise<TimerScheduled> {
    // TODO validate
    await this.props.timerClient.scheduleEvent<TimerCompleted>({
      event: {
        type: WorkflowEventType.TimerCompleted,
        seq: command.seq,
      },
      schedule: command.schedule,
      executionId,
    });

    return createEvent<TimerScheduled>(
      {
        type: WorkflowEventType.TimerScheduled,
        seq: command.seq,
        untilTime: computeScheduleDate(
          command.schedule,
          baseTime
        ).toISOString(),
      },
      baseTime
    );
  }

  private async sendSignal(
    executionId: string,
    command: SendSignalCommand,
    baseTime: Date
  ) {
    const childExecutionId = isChildExecutionTarget(command.target)
      ? formatExecutionId(
          command.target.workflowName,
          formatChildExecutionName(executionId, command.target.seq)
        )
      : command.target.executionId;

    await this.props.executionQueueClient.sendSignal({
      signal: command.signalId,
      execution: childExecutionId,
      id: `${executionId}/${command.seq}`,
      payload: command.payload,
    });

    return createEvent<SignalSent>(
      {
        type: WorkflowEventType.SignalSent,
        executionId: childExecutionId,
        seq: command.seq,
        signalId: command.signalId,
        payload: command.payload,
      },
      baseTime
    );
  }

  private async publishEvents(command: PublishEventsCommand, baseTime: Date) {
    await this.props.eventClient.publishEvents(...command.events);
    return createEvent<EventsPublished>(
      {
        type: WorkflowEventType.EventsPublished,
        events: command.events,
        seq: command.seq!,
      },
      baseTime
    );
  }
}
