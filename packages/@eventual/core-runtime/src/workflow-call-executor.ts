import { ExecutionID, Workflow } from "@eventual/core";
import {
  AwaitTimerCall,
  ChildWorkflowCall,
  ChildWorkflowScheduled,
  EntityCall,
  EntityOperation,
  EntityRequest,
  EntityRequestFailed,
  EntityRequestSucceeded,
  EventsEmitted,
  HistoryStateEvent,
  InvokeTransactionCall,
  EmitEventsCall,
  SendSignalCall,
  SignalSent,
  TaskCall,
  TaskScheduled,
  TimerCompleted,
  TimerScheduled,
  TransactionRequest,
  TransactionRequestFailed,
  TransactionRequestSucceeded,
  WorkflowEventType,
  assertNever,
  isAwaitTimerCall,
  isChildExecutionTarget,
  isChildWorkflowCall,
  isConditionCall,
  isEntityCall,
  isEntityOperationOfType,
  isExpectSignalCall,
  isInvokeTransactionCall,
  isEmitEventsCall,
  isRegisterSignalHandlerCall,
  isSendSignalCall,
  isTaskCall,
} from "@eventual/core/internal";
import { EntityClient } from "./clients/entity-client.js";
import { EventClient } from "./clients/event-client.js";
import { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import { TaskClient, TaskWorkerRequest } from "./clients/task-client.js";
import { TimerClient } from "./clients/timer-client.js";
import { TransactionClient } from "./clients/transaction-client.js";
import { WorkflowClient } from "./clients/workflow-client.js";
import { formatChildExecutionName, formatExecutionId } from "./execution.js";
import { normalizeError } from "./result.js";
import { computeScheduleDate } from "./schedule.js";
import { createEvent } from "./workflow-events.js";
import { WorkflowCall } from "./workflow-executor.js";

interface WorkflowCallExecutorProps {
  taskClient: TaskClient;
  entityClient: EntityClient;
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
    if (isTaskCall(call.call)) {
      return await this.scheduleTask(
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
    } else if (isEmitEventsCall(call.call)) {
      return this.emitEvents(call.call, call.seq, baseTime);
    } else if (
      isConditionCall(call.call) ||
      isExpectSignalCall(call.call) ||
      isRegisterSignalHandlerCall(call.call)
    ) {
      // do nothing
      return undefined;
    } else if (isEntityCall(call.call)) {
      return this.executeEntityRequest(
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

  private async scheduleTask(
    workflow: Workflow,
    executionId: string,
    call: TaskCall,
    seq: number,
    baseTime: Date
  ) {
    const request: TaskWorkerRequest = {
      scheduledTime: baseTime.toISOString(),
      workflowName: workflow.name,
      executionId,
      input: call.input,
      taskName: call.name,
      seq,
      heartbeat: call.heartbeat,
      retry: 0,
    };

    await this.props.taskClient.startTask(request);

    return createEvent<TaskScheduled>(
      {
        type: WorkflowEventType.TaskScheduled,
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

  private async emitEvents(call: EmitEventsCall, seq: number, baseTime: Date) {
    await this.props.eventClient.emitEvents(...call.events);
    return createEvent<EventsEmitted>(
      {
        type: WorkflowEventType.EventsEmitted,
        events: call.events,
        seq,
      },
      baseTime
    );
  }

  private async executeEntityRequest(
    executionId: string,
    call: EntityCall,
    seq: number,
    baseTime: Date
  ) {
    const self = this;
    try {
      const result = await invokeEntityOperation(call);
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<EntityRequestSucceeded>(
          {
            type: WorkflowEventType.EntityRequestSucceeded,
            operation: call.operation,
            name: isEntityOperationOfType("transact", call)
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
        createEvent<EntityRequestFailed>(
          {
            type: WorkflowEventType.EntityRequestFailed,
            seq,
            name: isEntityOperationOfType("transact", call)
              ? undefined
              : call.name,
            operation: call.operation,
            ...normalizeError(err),
          },
          baseTime
        )
      );
    }

    return createEvent<EntityRequest>(
      {
        type: WorkflowEventType.EntityRequest,
        operation: call,
        seq,
      },
      baseTime
    );

    async function invokeEntityOperation(operation: EntityOperation) {
      if (isEntityOperationOfType("transact", operation)) {
        return self.props.entityClient.transactWrite(operation.items);
      }
      const entity = await self.props.entityClient.getEntity(operation.name);
      if (!entity) {
        throw new Error(`Entity ${operation.name} does not exist`);
      }
      if (isEntityOperationOfType("get", operation)) {
        return entity.get(operation.key);
      } else if (isEntityOperationOfType("getWithMetadata", operation)) {
        return entity.getWithMetadata(operation.key);
      } else if (isEntityOperationOfType("set", operation)) {
        return entity.set(operation.key, operation.value, operation.options);
      } else if (isEntityOperationOfType("delete", operation)) {
        return entity.delete(operation.key, operation.options);
      } else if (isEntityOperationOfType("list", operation)) {
        return entity.list(operation.request);
      } else if (isEntityOperationOfType("listKeys", operation)) {
        return entity.listKeys(operation.request);
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
