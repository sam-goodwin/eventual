import type { ExecutionID, Workflow } from "@eventual/core";
import {
  CallKind,
  CallSymbol,
  type Call,
  type EventualPromise,
} from "@eventual/core/internal";
import { EmitEventsCallExecutor } from "../call-executors/emit-events-call-executor.js";
import type { EventClient } from "../clients/event-client.js";
import type { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import type { OpenSearchClient } from "../clients/open-search-client.js";
import type { TaskClient } from "../clients/task-client.js";
import type { TimerClient } from "../clients/timer-client.js";
import type { TransactionClient } from "../clients/transaction-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { BucketStore } from "../stores/bucket-store.js";
import type { EntityStore } from "../stores/entity-store.js";
import { AwaitTimerWorkflowExecutor } from "./call-executors-and-factories/await-timer-call.js";
import { createBucketWorkflowQueueExecutor } from "./call-executors-and-factories/bucket-store-call.js";
import { createEntityWorkflowQueueExecutor } from "./call-executors-and-factories/entity-store-call.js";
import { NoOpWorkflowExecutor } from "./call-executors-and-factories/no-op-call-executor.js";
import { createSearchWorkflowQueueExecutor } from "./call-executors-and-factories/open-search-client-call.js";
import { TaskCallWorkflowExecutor } from "./call-executors-and-factories/task-call.js";
import { SendSignalWorkflowCallExecutor } from "./call-executors-and-factories/send-signal-call.js";
import { SimpleWorkflowExecutorAdaptor } from "./call-executors-and-factories/simple-workflow-executor-adaptor.js";
import { createTransactionWorkflowQueueExecutor } from "./call-executors-and-factories/transaction-call.js";
import { UnsupportedWorkflowCallExecutor } from "./call-executors-and-factories/unsupported.js";
import { ChildWorkflowCallWorkflowExecutor } from "./call-executors-and-factories/child-workflow-call.js";

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
  const workflowClientExecutor = new ChildWorkflowCallWorkflowExecutor(
    deps.workflowClient
  );

  return new AllWorkflowCallExecutor({
    AwaitTimerCall: new AwaitTimerWorkflowExecutor(deps.timerClient),
    BucketCall: createBucketWorkflowQueueExecutor(
      deps.bucketStore,
      deps.executionQueueClient
    ),
    ConditionCall: noOpExecutor, // conditions do not generate events
    EmitEventsCall: new SimpleWorkflowExecutorAdaptor(
      new EmitEventsCallExecutor(deps.eventClient)
    ),
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
    SendSignalCall: new SendSignalWorkflowCallExecutor(
      deps.executionQueueClient
    ),
    TaskCall: new TaskCallWorkflowExecutor(deps.taskClient),
    TaskRequestCall: unsupportedExecutor, // TODO: add support for task heartbeat, success, and failure to the workflow
    ChildWorkflowCall: workflowClientExecutor,
    GetExecutionCall: unsupportedExecutor, // TODO: add support for getting execution info
    StartWorkflowCall: unsupportedExecutor, // TODO: add support for start workflow call
  });
}

export type AllWorkflowCallExecutors = {
  [K in keyof typeof CallKind]: WorkflowCallExecutor<
    Call & { [CallSymbol]: (typeof CallKind)[K] }
  >;
};

export interface WorkflowCallExecutor<C extends Call = Call> {
  executeForWorkflow(
    call: C,
    inputs: WorkflowCallExecutorProps
  ): Promise<void> | void;
}

export interface WorkflowCallExecutorProps {
  executionId: ExecutionID;
  executionTime: Date;
  seq: number;
  workflow: Workflow;
}

/**
 * Uses the clients to execute all supported calls and return events.
 */
export class AllWorkflowCallExecutor implements WorkflowCallExecutor {
  constructor(private executors: AllWorkflowCallExecutors) {}

  public async executeForWorkflow(
    call: Call,
    props: WorkflowCallExecutorProps
  ): Promise<void> {
    const kind = call[CallSymbol];
    const executor = this.executors[CallKind[kind] as keyof typeof CallKind] as
      | WorkflowCallExecutor
      | undefined;

    if (executor) {
      return executor.executeForWorkflow(
        call,
        props
      ) as unknown as EventualPromise<any>;
    }

    throw new Error(`Missing Executor for ${CallKind[kind]}`);
  }
}
