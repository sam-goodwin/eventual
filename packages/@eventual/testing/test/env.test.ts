import type { SQSClient } from "@aws-sdk/client-sqs";
import {
  activity as _activity,
  ActivityHandler,
  CompositeKey,
  entity,
  Entity,
  EventPayloadType,
  EventualError,
  Execution,
  ExecutionStatus,
  SubscriptionHandler,
  Timeout,
  workflow as _workflow,
  WorkflowHandler,
} from "@eventual/core";
import { activities, workflows } from "@eventual/core/internal";
import { jest } from "@jest/globals";
import z from "zod";
import { TestEnvironment } from "../src/environment.js";
import { MockActivity } from "../src/providers/activity-provider.js";

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
  activity1,
  actWithTimeout,
  continueEvent,
  continueSignal,
  dataDoneEvent,
  dataDoneSignal,
  dataEvent,
  dataSignal,
  errorWorkflow,
  longRunningAct,
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

const activity = (() => {
  let n = 0;
  return <Input = any, Output = any>(
    handler: ActivityHandler<Input, Output>
  ) => {
    while (activities()[`act${++n}`]) {}
    return _activity<string, Input, Output>(`act${n}`, handler);
  };
})();

const workflow = (() => {
  let n = 0;
  return <Input = any, Output = any>(
    handler: WorkflowHandler<Input, Output>
  ) => {
    while (workflows().has(`wf${++n}`)) {}
    return _workflow<Input, Output>(`wf${n}`, handler);
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

describe("activity", () => {
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

    // progress time, the activity should be done now.
    // note: running real activities uses an async function and may not be done by the next tick
    await env.tick();

    // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
    const r2 = await result.getStatus();
    // and the execution updated to a succeeded state
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.SUCCEEDED,
      result: [[{ status: "fulfilled", value: "hi" }]],
    });
  });

  describe("mocked", () => {
    let mockActivity: MockActivity<typeof activity1>;
    beforeAll(() => {
      mockActivity = env.mockActivity(activity1);
    });

    test("succeed with inline mock", async () => {
      env.mockActivity(activity1, "hello from the inline mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: undefined,
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      env.mockActivity(activity1, () => "hello from the inline invoke");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: undefined,
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      mockActivity.succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: undefined,
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a succeeded state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.SUCCEEDED,
        result: [[{ status: "fulfilled", value: "hello from the mock" }]],
      });
    });

    test("succeed many always", async () => {
      mockActivity.succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      mockActivity.fail(new Error("Ahhh"));
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      mockActivity.failOnce(new Error("Ahhh")).succeed("not a failure");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      mockActivity
        .failOnce(new MyError("Ahhh"))
        .failOnce(new MyEventualError("aHHH"));
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 2 },
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      mockActivity.failOnce("hello?" as any);
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 1 },
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      mockActivity.succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { series: 3 },
      });
      // while activity call 1 succeeds, update the mock result
      mockActivity.succeed("new mock result");
      await env.tick();

      // while activity call 2 succeeds, update the mock result
      mockActivity.succeed("another new mock result");
      // activity call 2 succeeds at tick 1, starting activity call 3
      // activity call 3 succeeds at tick 2
      await env.tick(2);

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
      mockActivity.succeedOnce("first!").succeed("hello from the mock");
      // execution starts
      const execution = await env.startExecution({
        workflow: workflow3,
        input: { parallel: 3 },
      });
      await env.tick();

      // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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
  describe("publishEvent", () => {
    test("using service handlers", async () => {
      const dataEventMock =
        jest.fn<SubscriptionHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvents([dataEvent], dataEventMock);
      const execution = await env.startExecution({
        workflow: signalWorkflow,
        input: undefined,
      });
      await env.publishEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.publishEvent(continueEvent, {
        executionId: execution.executionId,
      });
      expect(dataEventMock).toBeCalledWith({
        executionId: execution.executionId,
        data: "event data",
      });
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
      await env.publishEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.publishEvent(continueEvent, {
        executionId: execution.executionId,
      });
      expect(dataEventMock).toBeCalledWith({
        executionId: execution.executionId,
        data: "event data",
      });
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
      await env.publishEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.publishEvent(continueEvent, {
        executionId: execution.executionId,
      });
      // the test env handler was called
      expect(dataEventMock).toBeCalledWith({
        executionId: execution.executionId,
        data: "event data",
      });

      // but the workflow was not progressed by the default subscriptions.
      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.IN_PROGRESS,
      });

      // enable and try again, the subscriptions should be working now.
      env.enableServiceSubscriptions();
      await env.publishEvent(dataEvent, {
        executionId: execution.executionId,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.executionId,
      });
      await env.publishEvent(continueEvent, {
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
      await env.publishEvent(dataEvent, {
        executionId: "dummy",
        data: "event data",
      });
      env.resetTestSubscriptions();
      await env.publishEvent(dataEvent, {
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
  let mockActivity: MockActivity<typeof actWithTimeout>;
  beforeAll(() => {
    mockActivity = env.mockActivity(actWithTimeout);
  });
  test("everyone is happy", async () => {
    mockActivity.succeed("hello");
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
    mockActivity.timeout();

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
    mockActivity.asyncResult();

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

describe("long running activities", () => {
  let activityToken: string | undefined;

  beforeEach(() => {
    fakeSqsClientSend.mockImplementation(async (command) => {
      if (command instanceof SendMessageCommand) {
        activityToken = command.input.MessageBody;
      } else {
        throw new Error("Expected send message");
      }
    });
  });

  afterEach(() => {
    fakeSqsClientSend.mockReset();
    activityToken = undefined;
  });

  test("async activity completion", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await longRunningAct.sendActivitySuccess({
      activityToken,
      result: { value: "hi" },
    });
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: { value: "hi" },
    });
  });

  test("async activity env completion", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await env.sendActivitySuccess<typeof longRunningAct>({
      activityToken,
      result: {
        value: "hi",
      },
    });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.SUCCEEDED,
      result: { value: "hi" },
    });
  });

  test("async activity env fail", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await env.sendActivityFailure({
      activityToken,
      error: "SomeError",
      message: "SomeMessage",
    });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.FAILED,
      error: "SomeError",
      message: "SomeMessage",
    });
  });

  test("async activity env fail no message", async () => {
    const execution = await env.startExecution({
      workflow: longRunningWorkflow,
      input: undefined,
    });

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await env.sendActivityFailure({ activityToken, error: "SomeError" });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.FAILED,
      error: "SomeError",
    });
  });

  describe("mock", () => {
    let mockActivity: MockActivity<typeof longRunningAct>;
    beforeEach(() => {
      mockActivity = env.mockActivity(longRunningAct);
    });

    test("succeed async immediately", async () => {
      mockActivity.succeed({ value: "i am a mock" });
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
      mockActivity.asyncResult();
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
      let activityToken: string | undefined;
      mockActivity.asyncResult((token) => {
        activityToken = token;
      });
      const execution = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });

      await env.tick(60 * 30);

      if (!activityToken) {
        throw new Error("Expected activity token to be set");
      }

      await env.sendActivitySuccess({
        activityToken,
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
      let activityToken: string | undefined;
      mockActivity
        .asyncResultOnce((token) => {
          activityToken = token;
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

      if (!activityToken) {
        throw new Error("Expected activity token to be set");
      }

      await env.sendActivitySuccess({
        activityToken,
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
      let activityToken: string | undefined;
      mockActivity.asyncResult((token) => {
        activityToken = token;
      });
      const execution = await env.startExecution({
        workflow: longRunningWorkflow,
        input: undefined,
      });

      await env.tick(60 * 60);

      if (!activityToken) {
        throw new Error("Expected activity token to be set");
      }

      await env.sendActivitySuccess({
        activityToken,
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

    // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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

    // the workflow should be done now, the activity succeeded event should have been processed in the `tick`
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

const myEntity = entity<{ n: number }>("testEntity1", z.any());

describe("entity", () => {
  test("workflow and activity uses get and set", async () => {
    const entityAct = activity(async (_, { execution: { id } }) => {
      await myEntity.set(id, { n: ((await myEntity.get(id))?.n ?? 0) + 1 });
    });
    const wf = workflow(async (_, { execution: { id } }) => {
      await myEntity.set(id, { n: 1 });
      await entityAct();
      const value = await myEntity.get(id);
      myEntity.delete(id);
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
      result: { n: 2 },
      status: ExecutionStatus.SUCCEEDED,
    });
  });

  test("workflow and activity uses get and set with namespaces", async () => {
    const entityAct = activity(
      async (namespace: string, { execution: { id } }) => {
        const key = { namespace, key: id };
        await myEntity.set(key, { n: ((await myEntity.get(key))?.n ?? 0) + 1 });
      }
    );
    const wf = workflow(async (_, { execution: { id } }) => {
      await myEntity.set({ namespace: "1", key: id }, { n: 1 });
      await myEntity.set({ namespace: "2", key: id }, { n: 100 });
      await entityAct("1");
      await entityAct("2");
      const value = await myEntity.get({ namespace: "1", key: id });
      const value2 = await myEntity.get({ namespace: "2", key: id });
      await myEntity.delete({ namespace: "1", key: id });
      await myEntity.delete({ namespace: "2", key: id });
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
      const key: CompositeKey = { namespace: "versionTest", key: id };
      // set - version 1 - value 1
      const { version } = await myEntity.set(key, { n: 1 });
      // set - version 2 - value 2
      const { version: version2 } = await myEntity.set(
        key,
        { n: 2 },
        { expectedVersion: version }
      );
      try {
        // try set to 3, fail
        await myEntity.set(key, { n: 3 }, { expectedVersion: version });
      } catch {
        // set - version 2 (unchanged) - value 3
        await myEntity.set(
          key,
          { n: 4 },
          { expectedVersion: version2, incrementVersion: false }
        );
      }
      try {
        // try delete and fail
        await myEntity.delete(key, { expectedVersion: version });
      } catch {
        // set - version 3 - value 5
        await myEntity.set(key, { n: 5 }, { expectedVersion: version2 });
      }

      const value = await myEntity.getWithMetadata(key);
      // delete at version 3
      myEntity.delete(key, { expectedVersion: value!.version });
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
      result: { entity: { n: 5 }, version: 3 },
      status: ExecutionStatus.SUCCEEDED,
    });
  });

  test("transact", async () => {
    const act = activity(
      async (
        {
          version,
          namespace,
          value,
        }: { version: number; namespace?: string; value: number },
        { execution: { id } }
      ) => {
        return Entity.transactWrite([
          {
            operation: {
              operation: "set",
              key: namespace ? { key: id, namespace } : id,
              value: { n: value },
              options: { expectedVersion: version },
            },
            entity: myEntity,
          },
          {
            operation: {
              operation: "set",
              key: { key: id, namespace: "3" },
              value: { n: value },
              options: { expectedVersion: version },
            },
            entity: myEntity,
          },
        ]);
      }
    );

    const wf = workflow(async (_, { execution: { id } }) => {
      const { version: version1 } = await myEntity.set(id, { n: 1 });
      const { version: version2 } = await myEntity.set(
        { key: id, namespace: "2" },
        { n: 1 }
      );
      await myEntity.set({ key: id, namespace: "3" }, { n: 1 });

      await act({ version: version1, value: 2 });
      try {
        await act({ version: version2 + 1, namespace: "2", value: 3 });
      } catch {}

      return Promise.all([
        myEntity.get(id),
        myEntity.get({ key: id, namespace: "2" }),
        myEntity.get({ key: id, namespace: "3" }),
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
      result: [{ n: 2 }, { n: 1 }, { n: 2 }],
      status: ExecutionStatus.SUCCEEDED,
    });
  });
});
