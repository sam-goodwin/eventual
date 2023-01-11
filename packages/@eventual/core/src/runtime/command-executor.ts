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
  ActivityTimedOut,
  WorkflowEventType,
  createEvent,
  ActivityScheduled,
  ChildWorkflowScheduled,
  SleepScheduled,
  SleepCompleted,
  ExpectSignalStarted,
  ExpectSignalTimedOut,
  HistoryStateEvent,
  ConditionStarted,
  ConditionTimedOut,
  SignalSent,
} from "../workflow-events.js";
import {
  DurationUnit,
  EventsPublished,
  isChildExecutionTarget,
} from "../index.js";
import { assertNever } from "../util.js";
import { Workflow } from "../workflow.js";
import { formatChildExecutionName, formatExecutionId } from "./execution-id.js";
import { ActivityWorkerRequest } from "./handlers/activity-worker.js";
import {
  EventClient,
  Schedule,
  TimerClient,
  WorkflowClient,
  WorkflowRuntimeClient,
} from "./index.js";

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
      return this.executeExpectSignal(executionId, command, baseTime);
    } else if (isSendSignalCommand(command)) {
      return this.sendSignal(executionId, command, baseTime);
    } else if (isStartConditionCommand(command)) {
      return this.startCondition(executionId, command, baseTime);
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

    const timeoutStarter = command.timeoutSeconds
      ? await this.props.timerClient.scheduleEvent<ActivityTimedOut>({
          schedule: Schedule.relative(command.timeoutSeconds, baseTime),
          event: {
            type: WorkflowEventType.ActivityTimedOut,
            seq: command.seq,
          },
          executionId,
        })
      : undefined;

    const activityStarter =
      this.props.workflowRuntimeClient.startActivity(request);

    await Promise.all([activityStarter, timeoutStarter]);

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
  ): Promise<SleepScheduled> {
    // TODO validate
    const untilTime = isAwaitTimeCommand(command)
      ? new Date(command.untilTime)
      : computeDurationDate(baseTime, command.dur, command.unit);
    const untilTimeIso = untilTime.toISOString();

    await this.props.timerClient.scheduleEvent<SleepCompleted>({
      event: {
        type: WorkflowEventType.SleepCompleted,
        seq: command.seq,
      },
      schedule: Schedule.absolute(untilTimeIso),
      executionId,
    });

    return createEvent<SleepScheduled>(
      {
        type: WorkflowEventType.SleepScheduled,
        seq: command.seq,
        untilTime: untilTime.toISOString(),
      },
      baseTime
    );
  }

  private async executeExpectSignal(
    executionId: string,

    command: ExpectSignalCommand,
    baseTime: Date
  ): Promise<ExpectSignalStarted> {
    if (command.timeoutSeconds) {
      await this.props.timerClient.scheduleEvent<ExpectSignalTimedOut>({
        event: {
          signalId: command.signalId,
          seq: command.seq,
          type: WorkflowEventType.ExpectSignalTimedOut,
        },
        schedule: Schedule.relative(command.timeoutSeconds, baseTime),
        executionId,
      });
    }

    return createEvent<ExpectSignalStarted>(
      {
        signalId: command.signalId,
        seq: command.seq,
        type: WorkflowEventType.ExpectSignalStarted,
        timeoutSeconds: command.timeoutSeconds,
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

  private async startCondition(
    executionId: string,
    command: StartConditionCommand,
    baseTime: Date
  ) {
    if (command.timeoutSeconds) {
      await this.props.timerClient.scheduleEvent<ConditionTimedOut>({
        event: {
          type: WorkflowEventType.ConditionTimedOut,
          seq: command.seq,
        },
        executionId,
        schedule: Schedule.relative(command.timeoutSeconds, baseTime),
      });
    }

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

export function computeDurationDate(
  now: Date,
  dur: number,
  unit: DurationUnit
) {
  const milliseconds =
    unit === "seconds" || unit === "second"
      ? dur * 1000
      : unit === "minutes" || unit === "minute"
      ? dur * 1000 * 60
      : unit === "hours" || unit === "hour"
      ? dur * 1000 * 60 * 60
      : unit === "days" || unit === "day"
      ? dur * 1000 * 60 * 60 * 24
      : unit === "years" || unit === "year"
      ? dur * 1000 * 60 * 60 * 24 * 365.25
      : assertNever(unit);

  return new Date(now.getTime() + milliseconds);
}
