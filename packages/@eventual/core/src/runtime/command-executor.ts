import {
  Command,
  ExpectSignalCommand,
  isExpectSignalCommand,
  isPublishEventsCommand,
  isScheduleActivityCommand,
  isScheduleWorkflowCommand,
  isSendSignalCommand,
  isAwaitDurationCommand,
  isAwaitTimeCommand,
  isStartConditionCommand,
  PublishEventsCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
  SendSignalCommand,
  AwaitDurationCommand,
  AwaitTimeCommand,
  StartConditionCommand,
} from "../command.js";
import {
  WorkflowEventType,
  createEvent,
  ActivityScheduled,
  ChildWorkflowScheduled,
  AlarmScheduled,
  AlarmCompleted,
  ExpectSignalStarted,
  HistoryStateEvent,
  ConditionStarted,
  SignalSent,
  EventsPublished,
} from "../workflow-events.js";
import { assertNever, computeDurationDate } from "../util.js";
import { Workflow } from "../workflow.js";
import { formatChildExecutionName, formatExecutionId } from "./execution-id.js";
import { ActivityWorkerRequest } from "./handlers/activity-worker.js";
import { Schedule, TimerClient } from "./clients/timer-client.js";
import { WorkflowRuntimeClient } from "./clients/workflow-runtime-client.js";
import { WorkflowClient } from "./clients/workflow-client.js";
import { EventClient } from "./clients/event-client.js";
import { isChildExecutionTarget } from "../signals.js";

interface CommandExecutorProps {
  workflowRuntimeClient: WorkflowRuntimeClient;
  timerClient: TimerClient;
  workflowClient: WorkflowClient;
  eventClient: EventClient;
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
    } else if (isAwaitDurationCommand(command) || isAwaitTimeCommand(command)) {
      // all sleep times are computed using the start time of the WorkflowTaskStarted
      return this.scheduleSleep(executionId, command, baseTime);
    } else if (isExpectSignalCommand(command)) {
      // should the timeout command be generic (ex: StartTimeout) or specific (ex: ExpectSignal)?
      return this.executeExpectSignal(command, baseTime);
    } else if (isSendSignalCommand(command)) {
      return this.sendSignal(executionId, command, baseTime);
    } else if (isStartConditionCommand(command)) {
      return this.startCondition(command, baseTime);
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
      scheduledTime: new Date().toISOString(),
      workflowName: workflow.workflowName,
      executionId,
      command,
      retry: 0,
    };

    await this.props.workflowRuntimeClient.startActivity(request);

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

  private async scheduleSleep(
    executionId: string,

    command: AwaitDurationCommand | AwaitTimeCommand,
    baseTime: Date
  ): Promise<AlarmScheduled> {
    // TODO validate
    const untilTime = isAwaitTimeCommand(command)
      ? new Date(command.untilTime)
      : computeDurationDate(baseTime, command.dur, command.unit);
    const untilTimeIso = untilTime.toISOString();

    await this.props.timerClient.scheduleEvent<AlarmCompleted>({
      event: {
        type: WorkflowEventType.AlarmCompleted,
        seq: command.seq,
      },
      schedule: Schedule.absolute(untilTimeIso),
      executionId,
    });

    return createEvent<AlarmScheduled>(
      {
        type: WorkflowEventType.AlarmScheduled,
        seq: command.seq,
        untilTime: untilTime.toISOString(),
      },
      baseTime
    );
  }

  private async executeExpectSignal(
    command: ExpectSignalCommand,
    baseTime: Date
  ): Promise<ExpectSignalStarted> {
    return createEvent<ExpectSignalStarted>(
      {
        signalId: command.signalId,
        seq: command.seq,
        type: WorkflowEventType.ExpectSignalStarted,
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

    await this.props.workflowClient.sendSignal({
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

  private async startCondition(command: StartConditionCommand, baseTime: Date) {
    return createEvent<ConditionStarted>(
      {
        type: WorkflowEventType.ConditionStarted,
        seq: command.seq!,
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
