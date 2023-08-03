import type { SQSClient } from "@aws-sdk/client-sqs";
import {
  Entity,
  entity,
  EventPayloadType,
  EventualError,
  Execution,
  ExecutionStatus,
  SubscriptionHandler,
  task as _task,
  TaskHandler,
  Timeout,
  workflow as _workflow,
  WorkflowHandler,
} from "@eventual/core";
import { getEventualResource } from "@eventual/core/internal";
import { jest } from "@jest/globals";
import z from "zod";
import { TestEnvironment } from "../src/environment.js";
import { MockTask } from "../src/providers/task-provider.js";

const fakeSqsClientSend = jest.fn<SQSClient["send"]>();
jest.unstable_mockModule("@aws-sdk/client-sqs", () => {
  return {
    ...(jest.requireActual("@aws-sdk/client-sqs") as any),
    SQSClient: jest
      .fn()
      .mockImplementation(() => ({ send: fakeSqsClientSend })),
  };
});
const { SendMessageCommand } = await import("@aws-sdk/client-sqs");

// using a dynamic import for the service/workflows because
// 1. this is an esm module https://jestjs.io/docs/ecmascript-modules#module-mocking-in-esm
// 2. we want the test env to use the mocked SQS client instead of the real one
// if YOU are not using mocked modules, the service can be imported normally.
const {
  task1,
  actWithTimeout,
  continueEvent,
  continueSignal,
  dataDoneEvent,
  dataDoneSignal,
  dataEvent,
  dataSignal,
  errorWorkflow,
  longRunningTask,
  longRunningWorkflow,
  orchestrate,
  orchestrateWorkflow,
  signalWorkflow,
  sleepWorkflow,
  timedWorkflow,
  timeWorkflow,
  workflow1,
  workflow3,
  workflowWithTimeouts,
} = await import("./workflow.js");

const task = (() => {
  let n = 0;
  return <Input = any, Output = any>(handler: TaskHandler<Input, Output>) => {
    // eslint-disable-next-line no-empty
    while (getEventualResource("Task", `task${++n}`)) {}
    return _task<string, Input, Output>(`task${n}`, handler);
  };
})();

const workflow = (() => {
  let n = 0;
  return <Input = any, Output = any>(
    handler: WorkflowHandler<Input, Output>
  ) => {
    // eslint-disable-next-line no-empty
    while (getEventualResource("Workflow", `wf${++n}`)) {}
    return _workflow<any, Input, Output>(`wf${n}`, handler);
  };
})();

let env: TestEnvironment;

// if there is pollution between tests, call reset()
beforeAll(async () => {
  env = new TestEnvironment();
});

afterEach(() => {
  env.resetTime();
});

describe("task", () => {
  test("use real by default", async () => {
    // execution starts
    const result = await env.startExecution({
      workflow: workflow3,
      input: undefined,
    });

    // see if the execution has succeeded
    const r1 = await result.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the task should be done now.
    // note: running real tasks uses an async function and may not be done by the next tick
    await env.tick();

    // the workflow should be done now, the task succeeded event should have been processed in the `tick`
    const r2 = await result.getStatus();
    // and the execution updated to a succeeded state
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.SUCCEEDED,
      result: [[{ status: "fulfilled", value: "hi" }]],
    });
  });

  describe("mocked", () => {
    let mockTask: MockTask<typeof task1>;
    beforeAll(() => {
      mockTask = env.mockTask(task1);
    });

    test("succeed with inline mock", async () => {
      env.mockTask(task1, "hello from the inline mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: undefined,
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [{ status: "fulfilled", value: "hello from the inline mock" }],
        ],
      });
    });

    test("succeed with inline invoke", async () => {
      env.mockTask(task1, () => "hello from the inline invoke");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: undefined,
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [{ status: "fulfilled", value: "hello from the inline invoke" }],
        ],
      });
    });

    test("succeed once with always", async () => {
      mockTask.succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: undefined,
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [[{ status: "fulfilled", value: "hello from the mock" }]],
      });
    });

    test("succeed many always", async () => {
      mockTask.succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [
            { status: "fulfilled", value: "hello from the mock" },
            { status: "fulfilled", value: "hello from the mock" },
            { status: "fulfilled", value: "hello from the mock" },
          ],
        ],
      });
    });

    test("fail many", async () => {
      mockTask.fail(new Error("Ahhh"));
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [
            { status: "rejected", reason: new Error("Ahhh") },
            { status: "rejected", reason: new Error("Ahhh") },
            { status: "rejected", reason: new Error("Ahhh") },
          ],
        ],
      });
    });

    test("fail once", async () => {
      mockTask.failOnce(new Error("Ahhh")).succeed("not a failure");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [
            { status: "rejected", reason: new Error("Ahhh") },
            { status: "fulfilled", value: "not a failure" },
            { status: "fulfilled", value: "not a failure" },
          ],
        ],
      });
    });

    class MyError extends Error {}
    class MyEventualError extends EventualError {}

    test("fail with custom errors", async () => {
      mockTask
        .failOnce(new MyError("Ahhh"))
        .failOnce(new MyEventualError("aHHH"));
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 2 },
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [
            {
              status: "rejected",
              reason: new EventualError("Error", "Ahhh"),
            },
            { status: "rejected", reason: new MyEventualError("aHHH") },
          ],
        ],
      });
    });

    test("fail with constant", async () => {
      mockTask.failOnce("hello?" as any);
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 1 },
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [
            {
              status: "rejected",
              reason: new EventualError("Error", '"hello?"'),
            },
          ],
        ],
      });
    });

    test("succeeded, changing during workflow", async () => {
      mockTask.succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { series: 3 },
      });
      // while task call 1 succeeds, update the mock result
      mockTask.succeed("new mock result");
      await env.tick();

      // while task call 2 succeeds, update the mock result
      mockTask.succeed("another new mock result");
      // task call 2 succeeds at tick 1, starting task call 3
      // task call 3 succeeds at tick 2
      await env.tick(2);

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [{ status: "fulfilled", value: "hello from the mock" }],
          [{ status: "fulfilled", value: "new mock result" }],
          [{ status: "fulfilled", value: "another new mock result" }],
        ],
      });
    });

    test("succeed once and then always", async () => {
      mockTask.succeedOnce("first!").succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the task succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [
          [
            { status: "fulfilled", value: "first!" },
            { status: "fulfilled", value: "hello from the mock" },
            { status: "fulfilled", value: "hello from the mock" },
          ],
        ],
      });
    });
  });
});

describe("sleep", () => {
  test("sleep relative", async () => {
    // execution starts
    const result = await env.startExecution({
      workflow: sleepWorkflow,
      input: true,
    });

    // see if the execution has succeeded
    const r1 = await result.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is for 10 seconds and should not be done
    await env.tick();

    console.log(env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await result.getStatus();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // advance 9 seconds, the sleep time (minus 1)
    await env.tick(9);

    const r3 = await result.getStatus();
    expect(r3).toMatchObject<Partial<typeof r3>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "hello",
    });
  });

  test("sleep relative in the future", async () => {
    await env.tickUntil("2022-01-01T12:00:00Z");
    // execution starts
    const result = await env.startExecution({
      workflow: sleepWorkflow,
      input: true,
    });

    // see if the execution has succeeded
    const r1 = await result.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is for 10 seconds and should not be done
    await env.tick();

    console.log(env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await result.getStatus();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // advance 9 seconds, the sleep time (minus 1)
    await env.tick(9);

    const r3 = await result.getStatus();
    expect(r3).toMatchObject<Partial<typeof r3>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "hello",
    });
  });

  /**
   * This test is to check for a bug where synthetic events were being
   * generated based on the real time and not the TestEnv time.
   */
  test("sleep and then send random signal", async () => {
    const execution = await env.startExecution({
      workflow: sleepWorkflow,
      input: true,
    });

    // see if the execution has succeeded
    const r1 = await execution.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is for 10 seconds and should not be done
    await env.tick();
    await execution.sendSignal("anySignal");

    console.log(env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await execution.getStatus();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // advance 9 seconds, the sleep time (minus 1)
    await env.tick(9);

    const r3 = await execution.getStatus();
    expect(r3).toMatchObject<Partial<typeof r3>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "hello",
    });
  });

  test("sleep absolute", async () => {
    // start at this date
    await env.tickUntil("2022-01-01T12:00:00Z");
    // execution starts
    const result = await env.startExecution({
      workflow: sleepWorkflow,
      input: false,
    });

    // see if the execution has succeeded
    const r1 = await result.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time,
    await env.tick();

    console.log("time", env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await result.getStatus();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // the sleep should end now
    await env.tickUntil("2022-01-02T12:00:00Z");

    const r3 = await result.getStatus();
    expect(r3).toMatchObject<Partial<typeof r3>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "hello",
    });
  });

  test("sleep absolute past", async () => {
    // start at this date
    await env.tickUntil("2022-01-03T12:00:00Z");
    // execution starts
    const result = await env.startExecution({
      workflow: sleepWorkflow,
      input: false,
    });

    const r1 = await result.getStatus();
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "hello",
    });
  });
});

describe("signal", () => {
  test("wait on signal", async () => {
    const execution = await env.startExecution({
      workflow: signalWorkflow,
      input: undefined,
    });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.IN_PROGRESS,
    });
  });

  test("send signal", async () => {
    const execution = await env.startExecution({
      workflow: signalWorkflow,
      input: undefined,
    });

    await execution.sendSignal(continueSignal);
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "done!",
    });
  });

  test("signal handler", async () => {
    const execution = await env.startExecution({
      workflow: signalWorkflow,
      input: undefined,
    });

    await execution.sendSignal(dataSignal, "override!");
    await env.tick();

    await execution.sendSignal(continueSignal);
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "override!",
    });
  });

  test("signal handler dispose", async () => {
    const execution = await env.startExecution({
      workflow: signalWorkflow,
      input: undefined,
    });

    await execution.sendSignal(dataDoneSignal);
    await env.tick();

    await execution.sendSignal(dataSignal, "muahahahaha");
    await env.tick();

    await execution.sendSignal(continueSignal);
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "done!",
    });
  });

  test("workflow send signal", async () => {
    const execution = await env.startExecution({
      workflow: signalWorkflow,
      input: undefined,
    });
    const orchestratorExecution = await env.startExecution({
      workflow: orchestrate,
      input: {
        targetExecutionId: execution.executionId,
      },
    });

    await env.tick(3);

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "hello from the orchestrator workflow!",
    });
    expect(await orchestratorExecution.getStatus()).toMatchObject<
      Partial<Execution>
    >({
      status: ExecutionStatus.SUCCEEDED,
      result: "nothing to see here",
    });
  });
});

describe("events", () => {
  describe("emitEvent", () => {
    test("using service handlers", async () => {
      const dataEventMock =
        jest.fn<SubscriptionHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvents([dataEvent], dataEventMock);
      const execution = await env.startExecution({
        workflow: signalWorkflow,
        input: undefined,
      });
      await env.emitEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.emitEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.emitEvent(continueEvent, {
        executionId: execution.executionId,
      });
      expect(dataEventMock).toBeCalledWith(
        {
          executionId: execution.executionId,
          data: "event data",
        },
        expect.anything()
      );
      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: "event data",
      });
    });

    test("workflow send events", async () => {
      const dataEventMock =
        jest.fn<SubscriptionHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvents([dataEvent], dataEventMock);

      const execution = await env.startExecution({
        workflow: signalWorkflow,
        input: undefined,
      });
      const orchestratorExecution = await env.startExecution({
        workflow: orchestrate,
        input: {
          targetExecutionId: execution.executionId,
          events: true,
        },
      });

      await env.tick(100);

      expect(dataEventMock).toHaveBeenCalled();

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: "hello from the orchestrator workflow!",
      });
      expect(await orchestratorExecution.getStatus()).toMatchObject<
        Partial<Execution>
      >({
        status: ExecutionStatus.SUCCEEDED,
        result: "nothing to see here",
      });
    });
  });

  describe("handle event", () => {
    test("using service handlers", async () => {
      const dataEventMock =
        jest.fn<SubscriptionHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvents([dataEvent], dataEventMock);
      const execution = await env.startExecution({
        workflow: signalWorkflow,
        input: undefined,
      });
      await env.emitEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.emitEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.emitEvent(continueEvent, {
        executionId: execution.executionId,
      });
      expect(dataEventMock).toBeCalledWith(
        {
          executionId: execution.executionId,
          data: "event data",
        },
        expect.anything()
      );
      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: "event data",
      });
    });
  });

  describe("toggle event handler", () => {
    test("disable and enable", async () => {
      env.disableServiceSubscriptions();

      const dataEventMock =
        jest.fn<SubscriptionHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvents([dataEvent], dataEventMock);
      const execution = await env.startExecution({
        workflow: signalWorkflow,
        input: undefined,
      });
      await env.emitEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.emitEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.emitEvent(continueEvent, {
        executionId: execution.executionId,
      });
      // the test env handler was called
      expect(dataEventMock).toBeCalledWith(
        {
          executionId: execution.executionId,
          data: "event data",
        },
        expect.anything()
      );

      // but the workflow was not progressed by the default subscriptions.
      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.IN_PROGRESS,
      });

      // enable and try again, the subscriptions should be working now.
      env.enableServiceSubscriptions();
      await env.emitEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.emitEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.emitEvent(continueEvent, {
        executionId: execution.executionId,
      });
      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: "event data",
      });

      expect(dataEventMock).toBeCalledTimes(2);
    });

    test("reset subscriptions", async () => {
      const dataEventMock =
        jest.fn<SubscriptionHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvents([dataEvent], dataEventMock);
      await env.emitEvent(dataEvent, {
        executionId: "dummy",
        data: "event data",
      });
      env.resetTestSubscriptions();
      await env.emitEvent(dataEvent, {
        executionId: "dummy",
        data: "event data",
      });
      expect(dataEventMock).toBeCalledTimes(1);
    });
  });
});

describe("completing executions", () => {
  test("succeed", async () => {
    const execution = await env.startExecution({
      workflow: workflow1,
      input: undefined,
    });

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.SUCCEEDED,
      workflowName: workflow1.name,
      result: "hi",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("succeed future", async () => {
    await env.tickUntil("2022-01-01");
    const execution = await env.startExecution({
      workflow: workflow1,
      input: undefined,
    });

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.SUCCEEDED,
      workflowName: workflow1.name,
      result: "hi",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("fail", async () => {
    const execution = await env.startExecution({
      workflow: errorWorkflow,
      input: undefined,
    });

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.FAILED,
      workflowName: errorWorkflow.name,
      error: "Error",
      message: "failed!",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("succeed future", async () => {
    await env.tickUntil("2022-01-01");
    const execution = await env.startExecution({
      workflow: errorWorkflow,
      input: undefined,
    });

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.FAILED,
      workflowName: errorWorkflow.name,
      error: "Error",
      message: "failed!",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });
});

describe("invoke workflow", () => {
  test("call real child", async () => {
    const execution = await env.startExecution({
      workflow: orchestrateWorkflow,
      input: undefined,
    });

    await env.tick(100);

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: "hello from a workflow",
    });
  });

  test("call real child that throws", async () => {
    const execution = await env.startExecution({
      workflow: orchestrateWorkflow,
      input: true,
    });

    await env.tick(100);

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.FAILED,
      error: "Error",
      message: "Ahh",
    });
  });
});

describe("timeouts", () => {
  let mockTask: MockTask<typeof actWithTimeout>;
  beforeAll(() => {
    mockTask = env.mockTask(actWithTimeout);
  });
  test("everyone is happy", async () => {
    mockTask.succeed("hello");
    const execution = await env.startExecution({
      workflow: workflowWithTimeouts,
      input: undefined,
    });

    await execution.sendSignal(dataSignal, "woo");
    await env.tick(3);

    expect(await execution.getStatus()).toMatchObject<
      Partial<Awaited<ReturnType<typeof execution.getStatus>>>
    >({
      status: ExecutionStatus.SUCCEEDED,
      result: [
        { status: "fulfilled", value: "hello" },
        { status: "fulfilled", value: "hello" },
        { status: "fulfilled", value: "woo" },
      ],
    });
  });

  test("explicit timeout", async () => {
    mockTask.timeout();

    const execution = await env.startExecution({
      workflow: workflowWithTimeouts,
      input: undefined,
    });
    await execution.sendSignal(dataSignal, "woo");
    await env.tick(4);

    expect(await execution.getStatus()).toMatchObject<
      Partial<Awaited<ReturnType<typeof execution.getStatus>>>
    >({
      status: ExecutionStatus.SUCCEEDED,
      result: [
        { status: "rejected", reason: new Timeout().toJSON() },
        { status: "rejected", reason: new Timeout().toJSON() },
        { status: "fulfilled", value: "woo" },
      ],
    });
  });

  test("implicit timeout", async () => {
    mockTask.asyncResult();

    const execution = await env.startExecution({
      workflow: workflowWithTimeouts,
      input: undefined,
    });

    await env.tick(70);

    expect(await execution.getStatus()).toMatchObject<
      Partial<Awaited<ReturnType<typeof execution.getStatus>>>
    >({
      status: ExecutionStatus.SUCCEEDED,
      result: [
        { status: "rejected", reason: new Timeout().toJSON() },
        { status: "rejected", reason: new Timeout().toJSON() },
        { status: "rejected", reason: new Timeout().toJSON() },
      ],
    });
  });
});

describe("long running tasks", () => {
  let taskToken: string | undefined;

  beforeEach(() => {
    fakeSqsClientSend.mockImplementation(async (command) => {
      if (command instanceof SendMessageCommand) {
        taskToken = command.input.MessageBody;
      } else {
        throw new Error("Expected send message");
      }
    });
  });

  afterEach(() => {
    fakeSqsClientSend.mockReset();
    taskToken = undefined;
  });

  test("async task completion", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!taskToken) {
      throw new Error("Expected task token to be set");
    }

    await longRunningTask.sendTaskSuccess({
      taskToken,
      result: { value: "hi" },
    });
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: { value: "hi" },
    });
  });

  test("async task env completion", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!taskToken) {
      throw new Error("Expected task token to be set");
    }

    await env.sendTaskSuccess<typeof longRunningTask>({
      taskToken,
      result: {
        value: "hi",
      },
    });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: { value: "hi" },
    });
  });

  test("async task env fail", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!taskToken) {
      throw new Error("Expected task token to be set");
    }

    await env.sendTaskFailure({
      taskToken,
      error: "SomeError",
      message: "SomeMessage",
    });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.FAILED,
      error: "SomeError",
      message: "SomeMessage",
    });
  });

  test("async task env fail no message", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!taskToken) {
      throw new Error("Expected task token to be set");
    }

    await env.sendTaskFailure({ taskToken, error: "SomeError" });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.FAILED,
      error: "SomeError",
    });
  });

  describe("mock", () => {
    let mockTask: MockTask<typeof longRunningTask>;
    beforeEach(() => {
      mockTask = env.mockTask(longRunningTask);
    });

    test("succeed async immediately", async () => {
      mockTask.succeed({ value: "i am a mock" });
      const execution = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });

      await env.tick();

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: { value: "i am a mock" },
      });
    });

    test("block", async () => {
      mockTask.asyncResult();
      const execution = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });

      await env.tick(60 * 60);

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: "sleep",
      });
    });

    test("block and succeed", async () => {
      let taskToken: string | undefined;
      mockTask.asyncResult((token) => {
        taskToken = token;
      });
      const execution = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });

      await env.tick(60 * 30);

      if (!taskToken) {
        throw new Error("Expected task token to be set");
      }

      await env.sendTaskSuccess({
        taskToken,
        result: {
          value: "hello from the async mock",
        },
      });

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: {
          value: "hello from the async mock",
        },
      });
    });

    test("block and succeed once", async () => {
      let taskToken: string | undefined;
      mockTask
        .asyncResultOnce((token) => {
          taskToken = token;
        })
        .succeed({ value: "not async" });
      const execution = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });
      const execution2 = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });

      await env.tick(60 * 30);

      if (!taskToken) {
        throw new Error("Expected task token to be set");
      }

      await env.sendTaskSuccess({
        taskToken,
        result: {
          value: "hello from the async mock",
        },
      });

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: {
          value: "hello from the async mock",
        },
      });
      expect(await execution2.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: {
          value: "not async",
        },
      });
    });

    test("block and succeed after sleep time", async () => {
      let taskToken: string | undefined;
      mockTask.asyncResult((token) => {
        taskToken = token;
      });
      const execution = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });

      await env.tick(60 * 60);

      if (!taskToken) {
        throw new Error("Expected task token to be set");
      }

      await env.sendTaskSuccess({
        taskToken,
        result: {
          value: "hello from the async mock",
        },
      });

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.SUCCEEDED,
        result: "sleep",
      });
    });
  });
});

describe("time", () => {
  test("signal time", async () => {
    const startDate = new Date("2022-01-01T00:00:00Z");
    const targetDate = new Date("2022-02-01T00:00:00Z");

    await env.tickUntil(startDate);
    const execution = await env.startExecution({
      workflow: timedWorkflow,
      input: { startDate: targetDate.toISOString() },
    });

    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");

    await env.tickUntil(targetDate);

    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");

    const r1 = await execution.getStatus();
    expect(r1.status).toEqual(ExecutionStatus.IN_PROGRESS);

    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");

    // the workflow should be done now, the task succeeded event should have been processed in the `tick`
    const r2 = await execution.getStatus();
    // and the execution updated to a succeeded state
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.SUCCEEDED,
      result: { seen: 13, n: 10 },
    });
  });

  test("output time", async () => {
    const startDate = new Date("2022-01-01T00:00:00Z");

    await env.tickUntil(startDate);

    const execution = await env.startExecution({
      workflow: timeWorkflow,
      input: undefined,
    });

    await execution.sendSignal(dataSignal, "hi");
    await execution.sendSignal(dataSignal, "hi");

    // the workflow should be done now, the task succeeded event should have been processed in the `tick`
    const r2 = await execution.getStatus();
    // and the execution updated to a succeeded state
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.SUCCEEDED,
      result: {
        dates: [
          "2022-01-01T00:00:01.000Z",
          "2022-01-01T00:00:02.000Z",
          "2022-01-01T00:00:03.000Z",
        ],
      },
    });
  });
});

const myEntity = entity("testEntity1", {
  attributes: { n: z.number(), id: z.string() },
  partition: ["id"],
});

const myEntityWithSort = entity("testEntity2", {
  attributes: { n: z.number(), id: z.string(), part: z.string() },
  partition: ["part"],
  sort: ["id"],
});

describe("entity", () => {
  test("workflow and task uses get and set", async () => {
    const entityTask = task(async (_, { execution: { id } }) => {
      await myEntity.put({ id, n: ((await myEntity.get([id]))?.n ?? 0) + 1 });
    });
    const wf = workflow(async (_, { execution: { id } }) => {
      await myEntity.put({ id, n: 1 });
      await entityTask();
      const value = await myEntity.get([id]);
      myEntity.delete({ id });
      return value;
    });

    const execution = await env.startExecution({
      workflow: wf,
      input: undefined,
    });

    await env.tick(20);

    await expect(execution.getStatus()).resolves.toMatchObject<
      Partial<Execution<any>>
    >({
      result: { n: 2, id: execution.executionId },
      status: ExecutionStatus.SUCCEEDED,
    });
  });

  test("workflow and task uses get and set with partitions and sort keys", async () => {
    const entityTask = task(async (part: string, { execution: { id } }) => {
      const key = { part, id };
      await myEntityWithSort.put({
        ...key,
        n: ((await myEntityWithSort.get(key))?.n ?? 0) + 1,
      });
    });
    const wf = workflow(async (_, { execution: { id } }) => {
      await myEntityWithSort.put({ part: "1", id, n: 1 });
      await myEntityWithSort.put({ part: "2", id, n: 100 });
      await entityTask("1");
      await entityTask("2");
      const value = await myEntityWithSort.get({ part: "1", id });
      const value2 = await myEntityWithSort.get({ part: "2", id });
      await myEntityWithSort.delete({ part: "1", id });
      await myEntityWithSort.delete({ part: "2", id });
      return value!.n + value2!.n;
    });

    const execution = await env.startExecution({
      workflow: wf,
      input: undefined,
    });

    await env.tick(20);

    await expect(execution.getStatus()).resolves.toMatchObject<
      Partial<Execution<any>>
    >({
      result: 103,
      status: ExecutionStatus.SUCCEEDED,
    });
  });

  test("version", async () => {
    const wf = workflow(async (_, { execution: { id } }) => {
      const key = { part: "versionTest", id };
      // set - version 1 - value 1
      const { version } = await myEntityWithSort.put({ ...key, n: 1 });
      // set - version 2 - value 2
      const { version: version2 } = await myEntityWithSort.put(
        { ...key, n: 2 },
        { expectedVersion: version }
      );
      try {
        // try set to 3, fail
        await myEntityWithSort.put(
          { ...key, n: 3 },
          { expectedVersion: version }
        );
      } catch {
        // set - version 2 (unchanged) - value 3
        await myEntityWithSort.put(
          { ...key, n: 4 },
          { expectedVersion: version2, incrementVersion: false }
        );
      }
      try {
        // try delete and fail
        await myEntityWithSort.delete(key, { expectedVersion: version });
      } catch {
        // set - version 3 - value 5
        await myEntityWithSort.put(
          { ...key, n: 5 },
          { expectedVersion: version2 }
        );
      }

      const value = await myEntityWithSort.getWithMetadata(key);
      // delete at version 3
      myEntityWithSort.delete(key, { expectedVersion: value!.version });
      return value;
    });

    const execution = await env.startExecution({
      workflow: wf,
      input: undefined,
    });

    await env.tick(20);

    await expect(execution.getStatus()).resolves.toMatchObject<
      Partial<Execution<any>>
    >({
      result: {
        value: { n: 5, id: execution.executionId, part: "versionTest" },
        version: 3,
      },
      status: ExecutionStatus.SUCCEEDED,
    });
  });

  test("transact", async () => {
    const testTask = task(
      async (
        {
          version,
          partition,
          value,
        }: { version: number; partition?: string; value: number },
        { execution: { id } }
      ) => {
        return Entity.transactWrite([
          partition
            ? {
                operation: "put",
                value: { part: partition, id, n: value },
                options: { expectedVersion: version },
                entity: myEntityWithSort,
              }
            : {
                operation: "put",
                value: { id, n: value },
                options: { expectedVersion: version },
                entity: myEntity,
              },
          {
            operation: "put",
            value: { part: "3", id, n: value },
            options: { expectedVersion: version },
            entity: myEntityWithSort,
          },
        ]);
      }
    );

    const wf = workflow(async (_, { execution: { id } }) => {
      const { version: version1 } = await myEntity.put({ id, n: 1 });
      const { version: version2 } = await myEntityWithSort.put({
        id,
        part: "2",
        n: 1,
      });
      await myEntityWithSort.put({ id, part: "3", n: 1 });

      await testTask({ version: version1, value: 2 });
      try {
        await testTask({ version: version2 + 1, partition: "2", value: 3 });
      } catch {}

      return Promise.all([
        myEntity.get([id]),
        myEntityWithSort.get({ id, part: "2" }),
        myEntityWithSort.get({ id, part: "3" }),
      ]);
    });

    const execution = await env.startExecution({
      workflow: wf,
      input: undefined,
    });

    await env.tick(20);

    await expect(execution.getStatus()).resolves.toMatchObject<
      Partial<Execution<any>>
    >({
      result: [
        { n: 2, id: execution.executionId },
        { part: "2", n: 1, id: execution.executionId },
        { part: "3", n: 2, id: execution.executionId },
      ],
      status: ExecutionStatus.SUCCEEDED,
    });
  });
});
