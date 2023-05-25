import {
  ExecutionID,
  OpenSearchClient,
  Workflow,
  assertApiResponseOK,
} from "@eventual/core";
import {
  AwaitTimerCall,
  BucketCall,
  BucketGetObjectSerializedResult,
  BucketRequest,
  BucketRequestFailed,
  BucketRequestSucceeded,
  ChildWorkflowCall,
  ChildWorkflowScheduled,
  EmitEventsCall,
  EntityCall,
  EntityOperation,
  EntityRequest,
  EntityRequestFailed,
  EntityRequestSucceeded,
  EventsEmitted,
  HistoryStateEvent,
  InvokeTransactionCall,
  SearchCall,
  SearchRequest,
  SearchRequestFailed,
  SearchRequestSucceeded,
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
  isBucketCall,
  isBucketCallType,
  isChildExecutionTarget,
  isChildWorkflowCall,
  isConditionCall,
  isEmitEventsCall,
  isEntityCall,
  isEntityOperationOfType,
  isExpectSignalCall,
  isInvokeTransactionCall,
  isRegisterSignalHandlerCall,
  isSearchCall,
  isSendSignalCall,
  isTaskCall,
} from "@eventual/core/internal";
import type { EventClient } from "./clients/event-client.js";
import type { ExecutionQueueClient } from "./clients/execution-queue-client.js";
import type { TaskClient, TaskWorkerRequest } from "./clients/task-client.js";
import type { TimerClient } from "./clients/timer-client.js";
import type { TransactionClient } from "./clients/transaction-client.js";
import type { WorkflowClient } from "./clients/workflow-client.js";
import { formatChildExecutionName, formatExecutionId } from "./execution.js";
import { normalizeError } from "./result.js";
import { computeScheduleDate } from "./schedule.js";
import type { BucketStore } from "./stores/bucket-store.js";
import type { EntityStore } from "./stores/entity-store.js";
import { streamToBuffer } from "./utils.js";
import { createEvent } from "./workflow-events.js";
import type { WorkflowCall } from "./workflow-executor.js";
import type { ApiResponse } from "@opensearch-project/opensearch";

interface WorkflowCallExecutorProps {
  bucketStore: BucketStore;
  entityStore: EntityStore;
  eventClient: EventClient;
  openSearchClient: OpenSearchClient;
  executionQueueClient: ExecutionQueueClient;
  taskClient: TaskClient;
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
    } else if (isBucketCall(call.call)) {
      return this.invokeBucketRequest(
        call.call,
        executionId,
        call.seq,
        baseTime
      );
    } else if (isSearchCall(call.call)) {
      return this.invokeSearchRequest(
        executionId,
        call.call,
        call.seq,
        baseTime
      );
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
              : call.entityName,
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
              : call.entityName,
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
        return self.props.entityStore.transactWrite(operation.items);
      } else if (isEntityOperationOfType("queryIndex", operation)) {
        return self.props.entityStore.queryIndex(
          operation.entityName,
          operation.indexName,
          ...operation.params
        );
      } else if (isEntityOperationOfType("scanIndex", operation)) {
        return self.props.entityStore.scanIndex(
          operation.entityName,
          operation.indexName,
          ...operation.params
        );
      }
      return self.props.entityStore[operation.operation](
        operation.entityName,
        // @ts-ignore
        ...operation.params
      );
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

  private async invokeBucketRequest(
    call: BucketCall,
    executionId: string,
    seq: number,
    baseTime: Date
  ) {
    if (isBucketCallType("put", call)) {
      // handle put separately to serialize the input
      const [key, data] = call.params;

      const buffer =
        typeof data === "string" || data instanceof Buffer
          ? data
          : await streamToBuffer(data);

      try {
        const result = await this.props.bucketStore.put(
          call.bucketName,
          key,
          buffer
        );

        await this.props.executionQueueClient.submitExecutionEvents(
          executionId,
          createEvent<BucketRequestSucceeded>(
            {
              type: WorkflowEventType.BucketRequestSucceeded,
              operation: "put",
              result: {
                etag: result.etag,
              },
              seq,
            },
            baseTime
          )
        );
      } catch (err) {
        await this.props.executionQueueClient.submitExecutionEvents(
          executionId,
          createEvent<BucketRequestFailed>(
            {
              type: WorkflowEventType.BucketRequestFailed,
              operation: "put",
              seq,
              ...normalizeError(err),
            },
            baseTime
          )
        );
      }

      return createEvent<BucketRequest>(
        {
          type: WorkflowEventType.BucketRequest,
          operation: {
            operation: "put",
            bucketName: call.bucketName,
            key,
            // serialize the data put into a string to be stored
            data:
              typeof buffer === "string" ? buffer : buffer.toString("base64"),
            isBase64Encoded: typeof buffer !== "string",
          },
          seq,
        },
        baseTime
      );
    }

    try {
      // handle get separately to serialize the result
      if (isBucketCallType("get", call)) {
        const result = await this.props.bucketStore.get(
          call.bucketName,
          ...call.params
        );

        await this.props.executionQueueClient.submitExecutionEvents(
          executionId,
          createEvent<BucketRequestSucceeded>(
            {
              type: WorkflowEventType.BucketRequestSucceeded,
              operation: call.operation,
              result: result
                ? ({
                    // serialize the data retrieved data to be stored
                    body: (
                      await streamToBuffer(result.body)
                    ).toString("base64"),
                    base64Encoded: true,
                    contentLength: result.contentLength,
                    etag: result.etag,
                  } satisfies BucketGetObjectSerializedResult)
                : undefined,
              seq,
            },
            baseTime
          )
        );
      } else {
        const result = await this.props.bucketStore[call.operation](
          call.bucketName,
          // @ts-ignore
          ...call.params
        );

        await this.props.executionQueueClient.submitExecutionEvents(
          executionId,
          createEvent<BucketRequestSucceeded>(
            {
              type: WorkflowEventType.BucketRequestSucceeded,
              operation: call.operation,
              result,
              seq,
            },
            baseTime
          )
        );
      }
    } catch (err) {
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<BucketRequestFailed>(
          {
            type: WorkflowEventType.BucketRequestFailed,
            operation: call.operation,
            seq,
            ...normalizeError(err),
          },
          baseTime
        )
      );
    }

    return createEvent<BucketRequest>(
      {
        type: WorkflowEventType.BucketRequest,
        operation: {
          operation: call.operation,
          bucketName: call.bucketName,
          // @ts-ignore
          params: call.params,
        },
        seq,
      },
      baseTime
    );
  }

  private async invokeSearchRequest(
    executionId: string,
    call: SearchCall,
    seq: number,
    baseTime: Date
  ) {
    try {
      const result: ApiResponse = await (
        this.props.openSearchClient.client as any
      )[call.operation](call.request);
      assertApiResponseOK(result);
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<SearchRequestSucceeded>(
          {
            type: WorkflowEventType.SearchRequestSucceeded,
            operation: call.operation,
            body: result.body,
            seq,
          },
          baseTime
        )
      );
    } catch (err) {
      await this.props.executionQueueClient.submitExecutionEvents(
        executionId,
        createEvent<SearchRequestFailed>(
          {
            type: WorkflowEventType.SearchRequestFailed,
            operation: call.operation,
            seq,
            ...normalizeError(err),
          },
          baseTime
        )
      );
    }

    return createEvent<SearchRequest>(
      {
        type: WorkflowEventType.SearchRequest,
        request: call.request,
        operation: call.operation,
        seq,
      },
      baseTime
    );
  }
}
