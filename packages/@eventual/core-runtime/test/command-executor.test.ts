import {
  EventEnvelope,
  Schedule,
  SendSignalRequest,
  Workflow,
} from "@eventual/core";
import {
  ChildWorkflowScheduled,
  EntityRequest,
  EventsEmitted,
  SignalSent,
  SignalTargetType,
  TaskScheduled,
  TimerCompleted,
  TimerScheduled,
  WorkflowEventType,
} from "@eventual/core/internal";
import { jest } from "@jest/globals";
import { EventClient } from "../src/clients/event-client.js";
import { ExecutionQueueClient } from "../src/clients/execution-queue-client.js";
import { TaskClient } from "../src/clients/task-client.js";
import {
  ScheduleEventRequest,
  TimerClient,
} from "../src/clients/timer-client.js";
import { TransactionClient } from "../src/clients/transaction-client.js";
import { WorkflowClient } from "../src/clients/workflow-client.js";
import {
  formatChildExecutionName,
  formatExecutionId,
  INTERNAL_EXECUTION_ID_PREFIX,
} from "../src/execution.js";
import { BucketStore } from "../src/stores/bucket-store.js";
import { EntityStore } from "../src/stores/entity-store.js";
import { WorkflowCallExecutor } from "../src/workflow-call-executor.js";
import {
  awaitTimerCall,
  childWorkflowCall,
  emitEventCall,
  entityRequestCall,
  sendSignalCall,
  taskCall,
} from "./call-util.js";

const mockTimerClient = {
  scheduleEvent: jest.fn() as TimerClient["scheduleEvent"],
} satisfies Partial<TimerClient> as TimerClient;
const mockWorkflowClient = {
  startExecution: jest.fn() as WorkflowClient["startExecution"],
} satisfies Partial<WorkflowClient> as WorkflowClient;
const mockTaskClient = {
  startTask: jest.fn() as TaskClient["startTask"],
} satisfies Partial<TaskClient> as TaskClient;
const mockEventClient = {
  emitEvents: jest.fn() as EventClient["emitEvents"],
} satisfies Partial<EventClient> as EventClient;
const mockExecutionQueueClient = {
  submitExecutionEvents:
    jest.fn() as ExecutionQueueClient["submitExecutionEvents"],
  sendSignal: jest.fn() as ExecutionQueueClient["sendSignal"],
} satisfies Partial<ExecutionQueueClient> as ExecutionQueueClient;
const mockEntityStore = {
  get: jest.fn() as EntityStore["get"],
  getWithMetadata: jest.fn() as EntityStore["getWithMetadata"],
  set: jest.fn() as EntityStore["set"],
  delete: jest.fn() as EntityStore["delete"],
  query: jest.fn() as EntityStore["query"],
} satisfies Partial<EntityStore> as EntityStore;
const mockTransactionClient = {
  executeTransaction: jest.fn() as TransactionClient["executeTransaction"],
} satisfies Partial<TransactionClient> as TransactionClient;
const mockBucketStore = {} satisfies Partial<BucketStore> as BucketStore;

const testExecutor = new WorkflowCallExecutor({
  bucketStore: mockBucketStore,
  entityStore: mockEntityStore,
  eventClient: mockEventClient,
  executionQueueClient: mockExecutionQueueClient,
  taskClient: mockTaskClient,
  transactionClient: mockTransactionClient,
  timerClient: mockTimerClient,
  workflowClient: mockWorkflowClient,
});

const workflow = {
  name: "myWorkflow",
} satisfies Partial<Workflow> as Workflow;
const executionId = "execId/123";

const baseTime = new Date();

afterEach(() => {
  jest.resetAllMocks();
});

describe("await times", () => {
  test("await time", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      awaitTimerCall(Schedule.time(baseTime), 0),
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).toHaveBeenCalledWith<
      [ScheduleEventRequest<TimerCompleted>]
    >({
      event: {
        type: WorkflowEventType.TimerCompleted,
        seq: 0,
      },
      schedule: Schedule.time(baseTime.toISOString()),
      executionId,
    });

    expect(event).toMatchObject<TimerScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.TimerScheduled,
      untilTime: baseTime.toISOString(),
    });
  });
});

describe("task", () => {
  test("start", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      taskCall("task", undefined, 0),
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).not.toHaveBeenCalled();

    expect(mockTaskClient.startTask).toHaveBeenCalledTimes(1);

    expect(event).toMatchObject<TaskScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.TaskScheduled,
      name: "task",
    });
  });
});

describe("workflow", () => {
  test("start", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      childWorkflowCall("workflow", undefined, 0),
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).not.toHaveBeenCalled();

    expect(mockWorkflowClient.startExecution).toHaveBeenCalledWith<
      Parameters<typeof mockWorkflowClient.startExecution>
    >({
      workflow: "workflow",
      parentExecutionId: executionId,
      executionName: expect.stringContaining(INTERNAL_EXECUTION_ID_PREFIX),
      seq: 0,
      input: undefined,
    });

    expect(event).toMatchObject<ChildWorkflowScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.ChildWorkflowScheduled,
      name: "workflow",
    });
  });
});

describe("send signal", () => {
  test("send", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      sendSignalCall(
        { executionId: "exec1", type: SignalTargetType.Execution },
        "signal",
        0
      ),
      baseTime
    );

    expect(mockExecutionQueueClient.sendSignal).toHaveBeenCalledWith<
      [SendSignalRequest]
    >({ signal: "signal", execution: "exec1", id: `${executionId}/${0}` });

    expect(event).toMatchObject<SignalSent>({
      seq: 0,
      executionId: "exec1",
      type: WorkflowEventType.SignalSent,
      timestamp: expect.stringContaining("Z"),
      signalId: "signal",
    });
  });

  test("send child workflow", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      sendSignalCall(
        {
          seq: 0,
          workflowName: "otherWorkflow",
          type: SignalTargetType.ChildExecution,
        },
        "signal",
        1
      ),
      baseTime
    );

    const childExecId = formatExecutionId(
      "otherWorkflow",
      formatChildExecutionName(executionId, 0)
    );

    expect(mockExecutionQueueClient.sendSignal).toHaveBeenCalledWith<
      [SendSignalRequest]
    >({
      signal: "signal",
      execution: childExecId,
      id: `${executionId}/${1}`,
      payload: undefined,
    });

    expect(event).toMatchObject<SignalSent>({
      seq: 1,
      executionId: childExecId,
      type: WorkflowEventType.SignalSent,
      timestamp: expect.stringContaining("Z"),
      signalId: "signal",
    });
  });
});

describe("emit events", () => {
  test("send", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      emitEventCall([{ event: {}, name: "myEvent" }], 0),
      baseTime
    );

    expect(mockEventClient.emitEvents).toHaveBeenCalledWith<[EventEnvelope]>({
      event: {},
      name: "myEvent",
    });

    expect(event).toMatchObject<EventsEmitted>({
      seq: 0,
      type: WorkflowEventType.EventsEmitted,
      timestamp: expect.stringContaining("Z"),
      events: [{ event: {}, name: "myEvent" }],
    });
  });
});

describe("entity request", () => {
  test("get", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall(
        { entityName: "ent", operation: "get", params: [["key"]] },
        0
      ),
      baseTime
    );

    expect(mockEntityStore.get).toHaveBeenCalledWith("ent", ["key"]);

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: { entityName: "ent", operation: "get", params: [["key"]] },
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("set", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall(
        {
          entityName: "ent",
          operation: "set",
          params: [{ key: "key", value: "some value" }],
        },
        0
      ),
      baseTime
    );

    expect(mockEntityStore.set).toHaveBeenCalledWith(
      "ent",
      { key: "key", value: "some value" },
      undefined
    );

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: {
        entityName: "ent",
        operation: "set",
        params: [{ key: "key", value: "some value" }],
      },
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("delete", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall(
        { entityName: "ent", operation: "delete", params: [["key"]] },
        0
      ),
      baseTime
    );

    expect(mockEntityStore.delete).toHaveBeenCalledWith(
      "ent",
      ["key"],
      undefined
    );

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: { entityName: "ent", operation: "delete", params: [["key"]] },
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("query", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall(
        {
          entityName: "ent",
          operation: "query",
          params: [{ partition: "part" }],
        },
        0
      ),
      baseTime
    );

    expect(mockEntityStore.query).toHaveBeenCalledWith("ent", {
      partition: "part",
    });

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: {
        entityName: "ent",
        operation: "query",
        params: [{ partition: "part" }],
      },
      timestamp: expect.stringContaining("Z"),
    });
  });
});
