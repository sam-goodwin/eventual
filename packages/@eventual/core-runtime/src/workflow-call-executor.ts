import { Dictionary, ExecutionID, Workflow } from "@eventual/core";
import {
  ActivityCall,
  ActivityScheduled,
  assertNever,
  AwaitTimerCall,
  ChildWorkflowCall,
  ChildWorkflowScheduled,
  DictionaryCall,
  DictionaryOperation,
  DictionaryRequest,
  DictionaryRequestFailed,
  DictionaryRequestSucceeded,
  EventsPublished,
  HistoryStateEvent,
  isActivityCall,
  isAwaitTimerCall,
  isChildExecutionTarget,
  isChildWorkflowCall,
  isConditionCall,
  isDictionaryCall,
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
import { DictionaryClient } from "./clients/dictionary-client.js";
import { EventClient } from "./clients/event-client.js";
import { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import { TimerClient } from "./clients/timer-client.js";
import { WorkflowClient } from "./clients/workflow-client.js";
import { formatChildExecutionName, formatExecutionId } from "./execution.js";
import { normalizeError } from "./result.js";
import { computeScheduleDate } from "./schedule.js";
import { createEvent } from "./workflow-events.js";
import { WorkflowCall } from "./workflow-executor.js";

interface WorkflowCallExecutorProps {
  timerClient: TimerClient;
  workflowClient: WorkflowClient;
  executionQueueClient: ExecutionQueueClient;
  eventClient: EventClient;
  activityClient: ActivityClient;
  dictionaryClient: DictionaryClient;
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
    } else if (isDictionaryCall(call.call)) {
      return this.executeDictionaryRequest(
        executionId,
        call.call,
        call.seq,
        baseTime
      );
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

  private async executeDictionaryRequest(
    executionId: string,
    call: DictionaryCall,
    seq: number,
    baseTime: Date
  ) {
    try {
      const dictionary = await this.props.dictionaryClient.getDictionary(
        call.name
      );
      if (!dictionary) {
        throw new Error(`Dictionary ${call.name} does not exist`);
      }
      const result = await invokeDictionaryOperation(
        call.operation,
        dictionary
      );
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<DictionaryRequestSucceeded>(
          {
            type: WorkflowEventType.DictionaryRequestSucceeded,
            name: call.name,
            operation: call.operation.operation,
            result,
            seq,
          },
          baseTime
        )
      );
    } catch (err) {
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<DictionaryRequestFailed>(
          {
            type: WorkflowEventType.DictionaryRequestFailed,
            seq,
            name: call.name,
            operation: call.operation.operation,
            ...normalizeError(err),
          },
          baseTime
        )
      );
    }

    return createEvent<DictionaryRequest>(
      {
        type: WorkflowEventType.DictionaryRequest,
        name: call.name,
        operation: call.operation,
        seq,
      },
      baseTime
    );

    async function invokeDictionaryOperation(
      operation: DictionaryOperation,
      dictionary: Dictionary<any>
    ) {
      if (operation.operation === "get") {
        return dictionary.get(operation.key);
      } else if (operation.operation === "set") {
        return dictionary.set(operation.key, operation.value);
      } else if (operation.operation === "delete") {
        return dictionary.delete(operation.key);
      } else if (operation.operation === "list") {
        return dictionary.list(operation.request);
      } else if (operation.operation === "listKeys") {
        return dictionary.listKeys(operation.request);
      }
    }
  }
}
