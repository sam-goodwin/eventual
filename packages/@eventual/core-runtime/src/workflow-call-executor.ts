import { ExecutionID, Workflow } from "@eventual/core";
import {
  ActivityCall,
  ActivityScheduled,
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
  InvokeTransactionCall,
  PublishEventsCall,
  SendSignalCall,
  SignalSent,
  TimerCompleted,
  TimerScheduled,
  TransactionRequest,
  TransactionRequestFailed,
  TransactionRequestSucceeded,
  WorkflowEventType,
  assertNever,
  isActivityCall,
  isAwaitTimerCall,
  isChildExecutionTarget,
  isChildWorkflowCall,
  isConditionCall,
  isDictionaryCall,
  isDictionaryOperationOfType,
  isExpectSignalCall,
  isInvokeTransactionCall,
  isPublishEventsCall,
  isRegisterSignalHandlerCall,
  isSendSignalCall,
} from "@eventual/core/internal";
import {
  ActivityClient,
  ActivityWorkerRequest,
} from "./clients/activity-client.js";
import { DictionaryClient } from "./clients/dictionary-client.js";
import { EventClient } from "./clients/event-client.js";
import { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import { TimerClient } from "./clients/timer-client.js";
import { TransactionClient } from "./clients/transaction-client.js";
import { WorkflowClient } from "./clients/workflow-client.js";
import { formatChildExecutionName, formatExecutionId } from "./execution.js";
import { normalizeError } from "./result.js";
import { computeScheduleDate } from "./schedule.js";
import { createEvent } from "./workflow-events.js";
import { WorkflowCall } from "./workflow-executor.js";

interface WorkflowCallExecutorProps {
  activityClient: ActivityClient;
  dictionaryClient: DictionaryClient;
  eventClient: EventClient;
  executionQueueClient: ExecutionQueueClient;
  timerClient: TimerClient;
  transactionClient: TransactionClient;
  workflowClient: WorkflowClient;
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
    } else if (isInvokeTransactionCall(call.call)) {
      return this.invokeTransaction(executionId, call.call, call.seq, baseTime);
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
    const self = this;
    try {
      const result = await invokeDictionaryOperation(call);
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<DictionaryRequestSucceeded>(
          {
            type: WorkflowEventType.DictionaryRequestSucceeded,
            operation: call.operation,
            name: isDictionaryOperationOfType("transact", call)
              ? undefined
              : call.name,
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
            name: isDictionaryOperationOfType("transact", call)
              ? undefined
              : call.name,
            operation: call.operation,
            ...normalizeError(err),
          },
          baseTime
        )
      );
    }

    return createEvent<DictionaryRequest>(
      {
        type: WorkflowEventType.DictionaryRequest,
        operation: call,
        seq,
      },
      baseTime
    );

    async function invokeDictionaryOperation(operation: DictionaryOperation) {
      if (isDictionaryOperationOfType("transact", operation)) {
        return self.props.dictionaryClient.transactWrite(operation.items);
      }
      const dictionary = await self.props.dictionaryClient.getDictionary(
        operation.name
      );
      if (!dictionary) {
        throw new Error(`Dictionary ${operation.name} does not exist`);
      }
      if (isDictionaryOperationOfType("get", operation)) {
        return dictionary.get(operation.key);
      } else if (isDictionaryOperationOfType("getWithMetadata", operation)) {
        return dictionary.getWithMetadata(operation.key);
      } else if (isDictionaryOperationOfType("set", operation)) {
        return dictionary.set(
          operation.key,
          operation.value,
          operation.options
        );
      } else if (isDictionaryOperationOfType("delete", operation)) {
        return dictionary.delete(operation.key, operation.options);
      } else if (isDictionaryOperationOfType("list", operation)) {
        return dictionary.list(operation.request);
      } else if (isDictionaryOperationOfType("listKeys", operation)) {
        return dictionary.listKeys(operation.request);
      }
      return assertNever(operation);
    }
  }

  private async invokeTransaction(
    executionId: string,
    call: InvokeTransactionCall,
    seq: number,
    baseTime: Date
  ) {
    try {
      const result = await this.props.transactionClient.executeTransaction({
        input: call.input,
        transaction: call.transactionName,
      });
      if (result.succeeded) {
        await this.props.executionQueueClient.submitExecutionEvents(
          executionId,
          createEvent<TransactionRequestSucceeded>(
            {
              type: WorkflowEventType.TransactionRequestSucceeded,
              result: result.output,
              seq,
            },
            baseTime
          )
        );
      } else {
        await this.props.executionQueueClient.submitExecutionEvents(
          executionId,
          createEvent<TransactionRequestFailed>(
            {
              type: WorkflowEventType.TransactionRequestFailed,
              error: "Transaction Failed",
              message: "",
              seq,
            },
            baseTime
          )
        );
      }
    } catch (err) {
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<TransactionRequestFailed>(
          {
            type: WorkflowEventType.TransactionRequestFailed,
            ...normalizeError(err),
            seq,
          },
          baseTime
        )
      );
    }

    return createEvent<TransactionRequest>(
      {
        type: WorkflowEventType.TransactionRequest,
        input: call.input,
        transactionName: call.transactionName,
        seq,
      },
      baseTime
    );
  }
}
