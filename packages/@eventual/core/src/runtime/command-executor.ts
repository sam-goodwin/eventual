import {
  Command,
  ExpectSignalCommand,
  FinishActivityCommand,
  isExpectSignalCommand,
  isFinishActivityCommand,
  isPublishEventsCommand,
  isScheduleActivityCommand,
  isScheduleWorkflowCommand,
  isSendSignalCommand,
  isSleepForCommand,
  isSleepUntilCommand,
  isStartConditionCommand,
  PublishEventsCommand,
  ScheduleActivityCommand,
  ScheduleWorkflowCommand,
  SendSignalCommand,
  SleepForCommand,
  SleepUntilCommand,
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
  ActivityFinished,
  ActivityCompleted,
  ActivityFailed,
} from "../workflow-events.js";
import {
  ActivityTargetType,
  EventsPublished,
  isChildExecutionTarget,
  isResolved,
} from "../index.js";
import { assertNever } from "../util.js";
import { Workflow } from "../workflow.js";
import { formatChildExecutionName, formatExecutionId } from "./execution-id.js";
import { ActivityWorkerRequest } from "./handlers/activity-worker.js";
import {
  ActivityRuntimeClient,
  decodeActivityToken,
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
  activityRuntimeClient: ActivityRuntimeClient;
}

/**
 * Uses the clients to execute all supported commands and return events.
 */
export class CommandExecutor {
  constructor(private props: CommandExecutorProps) {}

  async executeCommand(
    workflow: Workflow,
    executionId: string,
    command: Command,
    baseTime: Date
  ): Promise<HistoryStateEvent> {
    const self = this;
    if (isScheduleActivityCommand(command)) {
      return await scheduleActivity(command);
    } else if (isScheduleWorkflowCommand(command)) {
      return scheduleChildWorkflow(command);
    } else if (isSleepForCommand(command) || isSleepUntilCommand(command)) {
      // all sleep times are computed using the start time of the WorkflowTaskStarted
      return scheduleSleep(command);
    } else if (isExpectSignalCommand(command)) {
      // should the timeout command be generic (ex: StartTimeout) or specific (ex: ExpectSignal)?
      return executeExpectSignal(command);
    } else if (isSendSignalCommand(command)) {
      return sendSignal(command);
    } else if (isStartConditionCommand(command)) {
      return startCondition(command);
    } else if (isPublishEventsCommand(command)) {
      return publishEvents(command);
    } else if (isFinishActivityCommand(command)) {
      return finishActivity(command);
    } else {
      return assertNever(command, `unknown command type`);
    }

    async function scheduleActivity(command: ScheduleActivityCommand) {
      const request: ActivityWorkerRequest = {
        scheduledTime: new Date().toISOString(),
        workflowName: workflow.workflowName,
        executionId,
        command,
        retry: 0,
      };

      const timeoutStarter = command.timeoutSeconds
        ? await self.props.timerClient.scheduleEvent<ActivityTimedOut>({
            schedule: Schedule.relative(command.timeoutSeconds, baseTime),
            event: {
              type: WorkflowEventType.ActivityTimedOut,
              seq: command.seq,
            },
            executionId,
          })
        : undefined;

      const activityStarter =
        self.props.workflowRuntimeClient.startActivity(request);

      await Promise.all([activityStarter, timeoutStarter]);

      return createEvent<ActivityScheduled>({
        type: WorkflowEventType.ActivityScheduled,
        seq: command.seq,
        name: command.name,
      });
    }

    async function scheduleChildWorkflow(
      command: ScheduleWorkflowCommand
    ): Promise<ChildWorkflowScheduled> {
      await self.props.workflowClient.startWorkflow({
        workflowName: command.name,
        input: command.input,
        parentExecutionId: executionId,
        executionName: formatChildExecutionName(executionId, command.seq),
        seq: command.seq,
        ...command.opts,
      });

      return createEvent<ChildWorkflowScheduled>({
        type: WorkflowEventType.ChildWorkflowScheduled,
        seq: command.seq,
        name: command.name,
        input: command.input,
      });
    }

    async function scheduleSleep(
      command: SleepForCommand | SleepUntilCommand
    ): Promise<SleepScheduled> {
      // TODO validate
      const untilTime = isSleepUntilCommand(command)
        ? new Date(command.untilTime)
        : new Date(baseTime.getTime() + command.durationSeconds * 1000);
      const untilTimeIso = untilTime.toISOString();

      await self.props.timerClient.scheduleEvent<SleepCompleted>({
        event: {
          type: WorkflowEventType.SleepCompleted,
          seq: command.seq,
        },
        schedule: Schedule.absolute(untilTimeIso),
        executionId,
      });

      return createEvent<SleepScheduled>({
        type: WorkflowEventType.SleepScheduled,
        seq: command.seq,
        untilTime: untilTime.toISOString(),
      });
    }

    async function executeExpectSignal(
      command: ExpectSignalCommand
    ): Promise<ExpectSignalStarted> {
      if (command.timeoutSeconds) {
        await self.props.timerClient.scheduleEvent<ExpectSignalTimedOut>({
          event: {
            signalId: command.signalId,
            seq: command.seq,
            type: WorkflowEventType.ExpectSignalTimedOut,
          },
          schedule: Schedule.relative(command.timeoutSeconds, baseTime),
          executionId,
        });
      }

      return createEvent<ExpectSignalStarted>({
        signalId: command.signalId,
        seq: command.seq,
        type: WorkflowEventType.ExpectSignalStarted,
        timeoutSeconds: command.timeoutSeconds,
      });
    }

    async function sendSignal(command: SendSignalCommand) {
      const childExecutionId = isChildExecutionTarget(command.target)
        ? formatExecutionId(
            command.target.workflowName,
            formatChildExecutionName(executionId, command.target.seq)
          )
        : command.target.executionId;

      await self.props.workflowClient.sendSignal({
        signal: command.signalId,
        executionId: childExecutionId,
        id: `${executionId}/${command.seq}`,
        payload: command.payload,
      });

      return createEvent<SignalSent>({
        type: WorkflowEventType.SignalSent,
        executionId: childExecutionId,
        seq: command.seq,
        signalId: command.signalId,
        payload: command.payload,
      });
    }

    async function startCondition(command: StartConditionCommand) {
      if (command.timeoutSeconds) {
        await self.props.timerClient.scheduleEvent<ConditionTimedOut>({
          event: {
            type: WorkflowEventType.ConditionTimedOut,
            seq: command.seq,
          },
          executionId,
          schedule: Schedule.relative(command.timeoutSeconds, baseTime),
        });
      }

      return createEvent<ConditionStarted>({
        type: WorkflowEventType.ConditionStarted,
        seq: command.seq!,
      });
    }

    async function publishEvents(command: PublishEventsCommand) {
      await self.props.eventClient.publish(...command.events);
      return createEvent<EventsPublished>({
        type: WorkflowEventType.EventsPublished,
        events: command.events,
        seq: command.seq!,
      });
    }

    async function finishActivity(command: FinishActivityCommand) {
      if (command.target.type === ActivityTargetType.OwnActivity) {
        await self.props.activityRuntimeClient.closeActivity(
          executionId,
          command.target.seq
        );
        return createEvent<ActivityFinished>({
          executionId,
          activitySeq: command.target.seq,
          seq: command.seq,
          type: WorkflowEventType.ActivityFinished,
        });
      } else {
        const data = decodeActivityToken(command.target.activityToken);
        if (isResolved(command.outcome)) {
          await self.props.workflowClient.submitWorkflowTask(
            data.payload.executionId,
            createEvent<ActivityCompleted>({
              type: WorkflowEventType.ActivityCompleted,
              seq: data.payload.seq,
              result: command.outcome.value,
            })
          );
        } else {
          await self.props.workflowClient.submitWorkflowTask(
            data.payload.executionId,
            createEvent<ActivityFailed>({
              type: WorkflowEventType.ActivityFailed,
              seq: data.payload.seq,
              error:
                command.outcome.error instanceof Error
                  ? command.outcome.error.name
                  : "Error",
              message:
                command.outcome.error instanceof Error
                  ? command.outcome.error.message
                  : JSON.stringify(command.outcome.error),
            })
          );
        }
        return createEvent<ActivityFinished>({
          executionId: data.payload.executionId,
          activitySeq: data.payload.seq,
          seq: command.seq,
          type: WorkflowEventType.ActivityFinished,
        });
      }
    }
  }
}
