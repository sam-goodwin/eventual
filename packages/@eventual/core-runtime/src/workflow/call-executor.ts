import type { ExecutionID, Workflow } from "@eventual/core";
import {
  EventualCall,
  EventualCallKind,
  EventualCallSymbol,
  type EventualPromise,
} from "@eventual/core/internal";
import type { EventClient } from "../clients/event-client.js";
import type { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import type { OpenSearchClient } from "../clients/open-search-client.js";
import type { TaskClient } from "../clients/task-client.js";
import type { TimerClient } from "../clients/timer-client.js";
import type { TransactionClient } from "../clients/transaction-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { BucketStore } from "../stores/bucket-store.js";
import type { EntityStore } from "../stores/entity-store.js";
import { AwaitTimerWorkflowExecutor } from "./call-executors/await-timer-call-executor.js";
import { createBucketWorkflowQueueExecutor } from "./call-executors/bucket-store-call-executor.js";
import { EmitEventsWorkflowExecutor } from "./call-executors/emit-events-call-executor.js";
import { createEntityWorkflowQueueExecutor } from "./call-executors/entity-store-call-executor.js";
import { NoOpWorkflowExecutor } from "./call-executors/no-op-call-executor.js";
import { createSearchWorkflowQueueExecutor } from "./call-executors/open-search-client-call-executor.js";
import { ScheduleTaskWorkflowExecutor } from "./call-executors/schedule-task-call-executor.js";
import { SendSignalWorkflowExecutor } from "./call-executors/send-signal-call-executor.js";
import { createTransactionWorkflowQueueExecutor } from "./call-executors/transaction-client-executor.js";
import { UnsupportedWorkflowCallExecutor } from "./call-executors/unsupported-executor.js";
import { WorkflowClientWorkflowCallExecutor } from "./call-executors/workflow-client-executor.js";
import type { WorkflowCall } from "./workflow-executor.js";

interface WorkflowCallExecutorDependencies {
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

const noOpExecutor = new NoOpWorkflowExecutor();
const unsupportedExecutor = new UnsupportedWorkflowCallExecutor();

export function createDefaultWorkflowCallExecutor(
  deps: WorkflowCallExecutorDependencies
) {
  const workflowClientExecutor = new WorkflowClientWorkflowCallExecutor(
    deps.workflowClient
  );

  return new WorkflowCallExecutor({
    AwaitTimerCall: new AwaitTimerWorkflowExecutor(deps.timerClient),
    BucketCall: createBucketWorkflowQueueExecutor(
      deps.bucketStore,
      deps.executionQueueClient
    ),
    ConditionCall: noOpExecutor, // conditions do not generate events
    EmitEventsCall: new EmitEventsWorkflowExecutor(deps.eventClient),
    EntityCall: createEntityWorkflowQueueExecutor(
      deps.entityStore,
      deps.executionQueueClient
    ),
    ExpectSignalCall: noOpExecutor, // expected signals do not generate events,
    InvokeTransactionCall: createTransactionWorkflowQueueExecutor(
      deps.transactionClient,
      deps.executionQueueClient
    ),
    RegisterSignalHandlerCall: noOpExecutor, // signal handlers do not generate events
    SearchCall: createSearchWorkflowQueueExecutor(
      deps.openSearchClient,
      deps.executionQueueClient
    ),
    SendSignalCall: new SendSignalWorkflowExecutor(deps.executionQueueClient),
    TaskCall: new ScheduleTaskWorkflowExecutor(deps.taskClient),
    TaskRequestCall: unsupportedExecutor, // TODO: add support for task heartbeat, success, and failure to the workflow
    ChildWorkflowCall: workflowClientExecutor,
    GetExecutionCall: unsupportedExecutor, // TODO: add support for getting execution info
    StartWorkflowCall: unsupportedExecutor, // TODO: add support for start workflow call
  });
}

export type EventualCallWorkflowExecutorCollection = {
  [K in keyof typeof EventualCallKind]: EventualWorkflowExecutor<
    EventualCall & { [EventualCallSymbol]: (typeof EventualCallKind)[K] }
  >;
};

export interface EventualWorkflowExecutor<
  C extends EventualCall = EventualCall
> {
  executeForWorkflow(
    call: C,
    inputs: WorkflowExecutorInput
  ): Promise<void> | void;
}

export interface WorkflowExecutorInput {
  executionId: ExecutionID;
  executionTime: Date;
  seq: number;
  workflow: Workflow;
}

/**
 * Uses the clients to execute all supported calls and return events.
 */
export class WorkflowCallExecutor {
  constructor(private executors: EventualCallWorkflowExecutorCollection) {}

  public async executeCall(
    workflow: Workflow,
    executionId: ExecutionID,
    call: WorkflowCall,
    baseTime: Date
  ): Promise<void> {
    const kind = call.call[EventualCallSymbol];
    const executor = this.executors[
      EventualCallKind[kind] as keyof typeof EventualCallKind
    ] as EventualWorkflowExecutor | undefined;

    if (executor) {
      return executor.executeForWorkflow(call.call, {
        executionId,
        seq: call.seq,
        executionTime: baseTime,
        workflow,
      }) as unknown as EventualPromise<any>;
    }

    throw new Error(`Missing Executor for ${EventualCallKind[kind]}`);
  }
}
