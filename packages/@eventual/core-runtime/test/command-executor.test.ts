import {
  Entity,
  EventEnvelope,
  Schedule,
  SendSignalRequest,
  Workflow,
} from "@eventual/core";
import {
  ActivityScheduled,
  ChildWorkflowScheduled,
  EntityMethods,
  EntityRequest,
  EventsPublished,
  SignalSent,
  SignalTargetType,
  TimerCompleted,
  TimerScheduled,
  WorkflowEventType,
} from "@eventual/core/internal";
import { jest } from "@jest/globals";
import { ActivityClient } from "../src/clients/activity-client.js";
import { EntityClient } from "../src/clients/entity-client.js";
import { EventClient } from "../src/clients/event-client.js";
import { ExecutionQueueClient } from "../src/clients/execution-queue-client.js";
import {
  ScheduleEventRequest,
  TimerClient,
} from "../src/clients/timer-client.js";
import { WorkflowClient } from "../src/clients/workflow-client.js";
import {
  formatChildExecutionName,
  formatExecutionId,
  INTERNAL_EXECUTION_ID_PREFIX,
} from "../src/execution.js";
import { WorkflowCallExecutor } from "../src/workflow-call-executor.js";
import {
  activityCall,
  awaitTimerCall,
  childWorkflowCall,
  entityRequestCall,
  publishEventCall,
  sendSignalCall,
} from "./call-util.js";
import { TransactionClient } from "../src/clients/transaction-client.js";

const mockTimerClient = {
  scheduleEvent: jest.fn() as TimerClient["scheduleEvent"],
} satisfies Partial<TimerClient> as TimerClient;
const mockWorkflowClient = {
  startExecution: jest.fn() as WorkflowClient["startExecution"],
} satisfies Partial<WorkflowClient> as WorkflowClient;
const mockActivityClient = {
  startActivity: jest.fn() as ActivityClient["startActivity"],
} satisfies Partial<ActivityClient> as ActivityClient;
const mockEventClient = {
  publishEvents: jest.fn() as EventClient["publishEvents"],
} satisfies Partial<EventClient> as EventClient;
const mockExecutionQueueClient = {
  submitExecutionEvents:
    jest.fn() as ExecutionQueueClient["submitExecutionEvents"],
  sendSignal: jest.fn() as ExecutionQueueClient["sendSignal"],
} satisfies Partial<ExecutionQueueClient> as ExecutionQueueClient;
const mockEntity = {
  get: jest.fn() as Entity<any>["get"],
  getWithMetadata: jest.fn() as Entity<any>["getWithMetadata"],
  set: jest.fn() as Entity<any>["set"],
  delete: jest.fn() as Entity<any>["delete"],
  list: jest.fn() as Entity<any>["list"],
  listKeys: jest.fn() as Entity<any>["listKeys"],
} satisfies EntityMethods<any>;
const mockEntityClient = {
  getEntity: jest.fn() as EntityClient["getEntity"],
} satisfies Partial<EntityClient> as EntityClient;
const mockTransactionClient = {
  executeTransaction: jest.fn() as TransactionClient["executeTransaction"],
} satisfies Partial<TransactionClient> as TransactionClient;

const testExecutor = new WorkflowCallExecutor({
  timerClient: mockTimerClient,
  workflowClient: mockWorkflowClient,
  activityClient: mockActivityClient,
  eventClient: mockEventClient,
  executionQueueClient: mockExecutionQueueClient,
  entityClient: mockEntityClient,
  transactionClient: mockTransactionClient,
});

const workflow = {
  name: "myWorkflow",
} satisfies Partial<Workflow> as Workflow;
const executionId = "execId/123";

const baseTime = new Date();

beforeEach(() => {
  (mockEntityClient.getEntity as jest.Mock<any>).mockResolvedValue(mockEntity);
});

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

describe("activity", () => {
  test("start", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      activityCall("activity", undefined, 0),
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).not.toHaveBeenCalled();

    expect(mockActivityClient.startActivity).toHaveBeenCalledTimes(1);

    expect(event).toMatchObject<ActivityScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.ActivityScheduled,
      name: "activity",
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

describe("publish events", () => {
  test("send", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      publishEventCall([{ event: {}, name: "myEvent" }], 0),
      baseTime
    );

    expect(mockEventClient.publishEvents).toHaveBeenCalledWith<[EventEnvelope]>(
      {
        event: {},
        name: "myEvent",
      }
    );

    expect(event).toMatchObject<EventsPublished>({
      seq: 0,
      type: WorkflowEventType.EventsPublished,
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
      entityRequestCall({ name: "dict", operation: "get", key: "key" }, 0),
      baseTime
    );

    expect(mockEntityClient.getEntity).toHaveBeenCalledWith("dict");
    expect(mockEntity.get).toHaveBeenCalledWith("key");

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: { name: "dict", operation: "get", key: "key" },
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("set", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall(
        { name: "dict", operation: "set", key: "key", value: "some value" },
        0
      ),
      baseTime
    );

    expect(mockEntityClient.getEntity).toHaveBeenCalledWith("dict");
    expect(mockEntity.set).toHaveBeenCalledWith("key", "some value", undefined);

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: {
        name: "dict",
        operation: "set",
        key: "key",
        value: "some value",
      },
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("delete", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall({ name: "dict", operation: "delete", key: "key" }, 0),
      baseTime
    );

    expect(mockEntityClient.getEntity).toHaveBeenCalledWith("dict");
    expect(mockEntity.delete).toHaveBeenCalledWith("key", undefined);

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: { name: "dict", operation: "delete", key: "key" },
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("list", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall({ name: "dict", operation: "list", request: {} }, 0),
      baseTime
    );

    expect(mockEntityClient.getEntity).toHaveBeenCalledWith("dict");
    expect(mockEntity.list).toHaveBeenCalledWith({});

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: { name: "dict", operation: "list", request: {} },
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("listKeys", async () => {
    const event = await testExecutor.executeCall(
      workflow,
      executionId,
      entityRequestCall(
        { name: "dict", operation: "listKeys", request: {} },
        0
      ),
      baseTime
    );

    expect(mockEntityClient.getEntity).toHaveBeenCalledWith("dict");
    expect(mockEntity.listKeys).toHaveBeenCalledWith({});

    expect(event).toMatchObject<EntityRequest>({
      seq: 0,
      type: WorkflowEventType.EntityRequest,
      operation: { name: "dict", operation: "listKeys", request: {} },
      timestamp: expect.stringContaining("Z"),
    });
  });
});
