import {
  ActivityScheduled,
  ChildWorkflowScheduled,
  CommandType,
  EventEnvelope,
  EventsPublished,
  formatChildExecutionName,
  formatExecutionId,
  INTERNAL_EXECUTION_ID_PREFIX,
  Schedule,
  SendSignalRequest,
  SignalSent,
  SignalTargetType,
  TimerCompleted,
  TimerScheduled,
  Workflow,
  WorkflowEventType,
} from "@eventual/core";
import { jest } from "@jest/globals";
import { ActivityClient } from "../src/clients/activity-client.js";
import { EventClient } from "../src/clients/event-client.js";
import { ExecutionQueueClient } from "../src/clients/execution-queue-client.js";
import {
  ScheduleEventRequest,
  TimerClient,
} from "../src/clients/timer-client.js";
import { WorkflowClient } from "../src/clients/workflow-client.js";
import { CommandExecutor } from "../src/command-executor.js";

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
  sendSignal: jest.fn() as ExecutionQueueClient["sendSignal"],
} satisfies Partial<ExecutionQueueClient> as ExecutionQueueClient;

const testExecutor = new CommandExecutor({
  timerClient: mockTimerClient,
  workflowClient: mockWorkflowClient,
  activityClient: mockActivityClient,
  eventClient: mockEventClient,
  executionQueueClient: mockExecutionQueueClient,
});

const workflow = {
  workflowName: "myWorkflow",
} satisfies Partial<Workflow> as Workflow;
const executionId = "execId/123";

const baseTime = new Date();

afterEach(() => {
  jest.resetAllMocks();
});

describe("await times", () => {
  test("await time", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.StartTimer,
        schedule: Schedule.time(baseTime),
        seq: 0,
      },
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
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.StartActivity,
        args: [],
        name: "activity",
        seq: 0,
      },
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
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.StartWorkflow,
        name: "workflow",
        seq: 0,
      },
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
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.SendSignal,
        signalId: "signal",
        seq: 0,
        target: { executionId: "exec1", type: SignalTargetType.Execution },
      },
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
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.SendSignal,
        signalId: "signal",
        seq: 1,
        target: {
          seq: 0,
          workflowName: "otherWorkflow",
          type: SignalTargetType.ChildExecution,
        },
      },
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

describe("public events", () => {
  test("send", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.PublishEvents,
        events: [{ event: {}, name: "myEvent" }],
        seq: 0,
      },
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
