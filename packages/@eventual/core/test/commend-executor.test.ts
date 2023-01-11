import { jest } from "@jest/globals";
import { CommandType } from "../src/command.js";
import {
  ActivityScheduled,
  ActivityTimedOut,
  ChildWorkflowScheduled,
  ConditionStarted,
  ConditionTimedOut,
  EventsPublished,
  ExpectSignalStarted,
  ExpectSignalTimedOut,
  SignalSent,
  SleepCompleted,
  SleepScheduled,
  WorkflowEventType,
} from "../src/workflow-events.js";
import {
  EventClient,
  EventEnvelope,
  formatChildExecutionName,
  formatExecutionId,
  INTERNAL_EXECUTION_ID_PREFIX,
  SendSignalRequest,
  SignalTargetType,
  WorkflowClient,
  WorkflowRuntimeClient,
} from "../src/index.js";
import {
  Schedule,
  ScheduleEventRequest,
  TimerClient,
} from "../src/runtime/clients/timer-client.js";
import { CommandExecutor } from "../src/runtime/command-executor.js";
import { Workflow } from "../src/workflow.js";

const mockTimerClient = {
  scheduleEvent: jest.fn() as TimerClient["scheduleEvent"],
} satisfies Partial<TimerClient> as TimerClient;
const mockWorkflowClient = {
  startExecution: jest.fn() as WorkflowClient["startExecution"],
  sendSignal: jest.fn() as WorkflowClient["sendSignal"],
} satisfies Partial<WorkflowClient> as WorkflowClient;
const mockWorkflowRuntimeClient = {
  startActivity: jest.fn() as WorkflowRuntimeClient["startActivity"],
} satisfies Partial<WorkflowRuntimeClient> as WorkflowRuntimeClient;
const mockEventClient = {
  publishEvents: jest.fn() as EventClient["publishEvents"],
} satisfies Partial<EventClient> as EventClient;

const testExecutor = new CommandExecutor({
  timerClient: mockTimerClient,
  workflowClient: mockWorkflowClient,
  workflowRuntimeClient: mockWorkflowRuntimeClient,
  eventClient: mockEventClient,
});

const workflow = {
  workflowName: "myWorkflow",
} satisfies Partial<Workflow> as Workflow;
const executionId = "execId";

const baseTime = new Date();

afterEach(() => {
  jest.resetAllMocks();
});

describe("await times", () => {
  test("await duration", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.AwaitDuration,
        dur: 10,
        unit: "seconds",
        seq: 0,
      },
      baseTime
    );

    const untilTime = new Date(baseTime.getTime() + 10 * 1000).toISOString();

    expect(mockTimerClient.scheduleEvent).toHaveBeenCalledWith<
      [ScheduleEventRequest<SleepCompleted>]
    >({
      event: {
        type: WorkflowEventType.SleepCompleted,
        seq: 0,
      },
      schedule: Schedule.absolute(untilTime),
      executionId,
    });

    expect(event).toMatchObject<SleepScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.SleepScheduled,
      untilTime,
    });
  });

  test("await time", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.AwaitTime,
        untilTime: baseTime.toISOString(),
        seq: 0,
      },
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).toHaveBeenCalledWith<
      [ScheduleEventRequest<SleepCompleted>]
    >({
      event: {
        type: WorkflowEventType.SleepCompleted,
        seq: 0,
      },
      schedule: Schedule.absolute(baseTime.toISOString()),
      executionId,
    });

    expect(event).toMatchObject<SleepScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.SleepScheduled,
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

    expect(mockWorkflowRuntimeClient.startActivity).toHaveBeenCalledTimes(1);

    expect(event).toMatchObject<ActivityScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.ActivityScheduled,
      name: "activity",
    });
  });

  test("start with timeout", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.StartActivity,
        args: [],
        name: "activity",
        seq: 0,
        timeoutSeconds: 100,
      },
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).toHaveBeenCalledWith<
      [ScheduleEventRequest<ActivityTimedOut>]
    >({
      event: {
        type: WorkflowEventType.ActivityTimedOut,
        seq: 0,
      },
      schedule: Schedule.relative(100, baseTime),
      executionId,
    });

    expect(mockWorkflowRuntimeClient.startActivity).toHaveBeenCalledTimes(1);

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

describe("expect signal", () => {
  test("start", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.ExpectSignal,
        signalId: "signal",
        seq: 0,
      },
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).not.toHaveBeenCalled();

    expect(event).toMatchObject<ExpectSignalStarted>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.ExpectSignalStarted,
      signalId: "signal",
    });
  });

  test("start", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.ExpectSignal,
        signalId: "signal",
        seq: 0,
        timeoutSeconds: 100,
      },
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).toHaveBeenCalledWith<
      [ScheduleEventRequest<ExpectSignalTimedOut>]
    >({
      event: {
        signalId: "signal",
        seq: 0,
        type: WorkflowEventType.ExpectSignalTimedOut,
      },
      schedule: Schedule.relative(100, baseTime),
      executionId,
    });

    expect(event).toMatchObject<ExpectSignalStarted>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.ExpectSignalStarted,
      signalId: "signal",
      timeoutSeconds: 100,
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

    expect(mockWorkflowClient.sendSignal).toHaveBeenCalledWith<
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

    expect(mockWorkflowClient.sendSignal).toHaveBeenCalledWith<
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

describe("condition", () => {
  test("send", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.StartCondition,
        seq: 0,
      },
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).not.toHaveBeenCalled();

    expect(event).toMatchObject<ConditionStarted>({
      seq: 0,
      type: WorkflowEventType.ConditionStarted,
      timestamp: expect.stringContaining("Z"),
    });
  });

  test("send with timeout", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.StartCondition,
        seq: 0,
        timeoutSeconds: 100,
      },
      baseTime
    );

    expect(mockTimerClient.scheduleEvent).toHaveBeenCalledWith<
      [ScheduleEventRequest<ConditionTimedOut>]
    >({
      event: {
        type: WorkflowEventType.ConditionTimedOut,
        seq: 0,
      },
      executionId,
      schedule: Schedule.relative(100, baseTime),
    });

    expect(event).toMatchObject<ConditionStarted>({
      seq: 0,
      type: WorkflowEventType.ConditionStarted,
      timestamp: expect.stringContaining("Z"),
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
