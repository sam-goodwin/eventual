import { jest } from "@jest/globals";
import {
  EventPayloadType,
  Execution,
  ExecutionStatus,
  EventHandler,
  Timeout,
  EventualError,
} from "@eventual/core";
import path from "path";
import * as url from "url";
import { TestEnvironment } from "../src/environment.js";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
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
  workflow1,
  workflow3,
  workflowWithTimeouts,
} from "./workflow.js";
import { MockActivity } from "../src/providers/activity-provider.js";
const fakeSqsClientSend = jest.fn<SQSClient["send"]>();
jest.mock("@aws-sdk/client-sqs", () => {
  return {
    ...(jest.requireActual("@aws-sdk/client-sqs") as any),
    SQSClient: jest
      .fn()
      .mockImplementation(() => ({ send: fakeSqsClientSend })),
  };
});

let env: TestEnvironment;

// if there is pollution between tests, call reset()
beforeAll(async () => {
  env = new TestEnvironment({
    entry: path.resolve(
      url.fileURLToPath(new URL(".", import.meta.url)),
      "./workflow.ts"
    ),
    outDir: path.resolve(
      url.fileURLToPath(new URL(".", import.meta.url)),
      ".eventual"
    ),
  });

  await env.initialize();
});

afterEach(() => {
  env.resetTime();
});

describe("activity", () => {
  test("use real by default", async () => {
    // execution starts
    const result = await env.startExecution(workflow3, undefined);

    // see if the execution has completed
    const r1 = await result.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the activity should be done now.
    // note: running real activities uses an async function and may not be done by the next tick
    await env.tick();

    // the workflow should be done now, the activity completed event should have been processed in the `tick`
    const r2 = await result.getStatus();
    // and the execution updated to a completed state
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.COMPLETE,
      result: [[{ status: "fulfilled", value: "hi" }]],
    });
  });

  describe("mocked", () => {
    let mockActivity: MockActivity<typeof activity1>;
    beforeAll(() => {
      mockActivity = env.mockActivity(activity1);
    });
    test("complete once with always", async () => {
      mockActivity.complete("hello from the mock");
      // execution starts
      const execution = await env.startExecution(workflow3, undefined);
      await env.tick();

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
        result: [[{ status: "fulfilled", value: "hello from the mock" }]],
      });
    });

    test("complete many always", async () => {
      mockActivity.complete("hello from the mock");
      // execution starts
      const execution = await env.startExecution(workflow3, { parallel: 3 });
      await env.tick();

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
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
      const execution = await env.startExecution(workflow3, { parallel: 3 });
      await env.tick();

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
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
      mockActivity.failOnce(new Error("Ahhh")).complete("not a failure");
      // execution starts
      const execution = await env.startExecution(workflow3, { parallel: 3 });
      await env.tick();

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
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
      const execution = await env.startExecution(workflow3, { parallel: 2 });
      await env.tick();

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
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
      const execution = await env.startExecution(workflow3, { parallel: 1 });
      await env.tick();

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
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

    test("complete, changing during workflow", async () => {
      mockActivity.complete("hello from the mock");
      // execution starts
      const execution = await env.startExecution(workflow3, { series: 3 });
      // while activity call 1 completes, update the mock result
      mockActivity.complete("new mock result");
      await env.tick();

      // while activity call 2 completes, update the mock result
      mockActivity.complete("another new mock result");
      // activity call 2 completes at tick 1, starting activity call 3
      // activity call 3 completes at tick 2
      await env.tick(2);

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
        result: [
          [{ status: "fulfilled", value: "hello from the mock" }],
          [{ status: "fulfilled", value: "new mock result" }],
          [{ status: "fulfilled", value: "another new mock result" }],
        ],
      });
    });

    test("complete once and then always", async () => {
      mockActivity.completeOnce("first!").complete("hello from the mock");
      // execution starts
      const execution = await env.startExecution(workflow3, { parallel: 3 });
      await env.tick();

      // the workflow should be done now, the activity completed event should have been processed in the `tick`
      const r2 = await execution.getStatus();
      // and the execution updated to a completed state
      expect(r2).toMatchObject<Partial<typeof r2>>({
        status: ExecutionStatus.COMPLETE,
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
    const result = await env.startExecution(sleepWorkflow, true);

    // see if the execution has completed
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
      status: ExecutionStatus.COMPLETE,
      result: "hello",
    });
  });

  test("sleep relative in the future", async () => {
    await env.tickUntil("2022-01-01T12:00:00Z");
    // execution starts
    const result = await env.startExecution(sleepWorkflow, true);

    // see if the execution has completed
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
      status: ExecutionStatus.COMPLETE,
      result: "hello",
    });
  });

  /**
   * This test is to check for a bug where synthetic events were being
   * generated based on the real time and not the TestEnv time.
   */
  test("sleep and then send random signal", async () => {
    const execution = await env.startExecution(sleepWorkflow, true);

    // see if the execution has completed
    const r1 = await execution.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is for 10 seconds and should not be done
    await env.tick();
    await execution.signal("anySignal", undefined);

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
      status: ExecutionStatus.COMPLETE,
      result: "hello",
    });
  });

  test("sleep absolute", async () => {
    // start at this date
    await env.tickUntil("2022-01-01T12:00:00Z");
    // execution starts
    const result = await env.startExecution(sleepWorkflow, false);

    // see if the execution has completed
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
      status: ExecutionStatus.COMPLETE,
      result: "hello",
    });
  });

  test("sleep absolute past", async () => {
    // start at this date
    await env.tickUntil("2022-01-03T12:00:00Z");
    // execution starts
    const result = await env.startExecution(sleepWorkflow, false);

    // see if the execution has completed
    const r1 = await result.getStatus();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is triggered
    // note: still need to progress once for the event to be processed
    await env.tick();

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r3 = await result.getStatus();
    expect(r3).toMatchObject<Partial<typeof r3>>({
      status: ExecutionStatus.COMPLETE,
      result: "hello",
    });
  });
});

describe("signal", () => {
  test("wait on signal", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.IN_PROGRESS,
    });
  });

  test("send signal", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    await execution.signal(continueSignal, undefined);
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "done!",
    });
  });

  test("signal handler", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    await execution.signal(dataSignal, "override!");
    await env.tick();

    await execution.signal(continueSignal, undefined);
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "override!",
    });
  });

  test("signal handler dispose", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    await execution.signal(dataDoneSignal, undefined);
    await env.tick();

    await execution.signal(dataSignal, "muahahahaha");
    await env.tick();

    await execution.signal(continueSignal, undefined);
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "done!",
    });
  });

  test("workflow send signal", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);
    const orchestratorExecution = await env.startExecution(orchestrate, {
      targetExecutionId: execution.executionId,
    });

    await env.tick(3);

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "hello from the orchestrator workflow!",
    });
    expect(await orchestratorExecution.getStatus()).toMatchObject<
      Partial<Execution>
    >({
      status: ExecutionStatus.COMPLETE,
      result: "nothing to see here",
    });
  });
});

describe("events", () => {
  describe("publishEvent", () => {
    test("using service handlers", async () => {
      const dataEventMock =
        jest.fn<EventHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvent(dataEvent, dataEventMock);
      const execution = await env.startExecution(signalWorkflow, undefined);
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
        status: ExecutionStatus.COMPLETE,
        result: "event data",
      });
    });

    test("workflow send events", async () => {
      const dataEventMock =
        jest.fn<EventHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvent(dataEvent, dataEventMock);

      const execution = await env.startExecution(signalWorkflow, undefined);
      const orchestratorExecution = await env.startExecution(orchestrate, {
        targetExecutionId: execution.executionId,
        events: true,
      });

      await env.tick(100);

      expect(dataEventMock).toHaveBeenCalled();

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: "hello from the orchestrator workflow!",
      });
      expect(await orchestratorExecution.getStatus()).toMatchObject<
        Partial<Execution>
      >({
        status: ExecutionStatus.COMPLETE,
        result: "nothing to see here",
      });
    });
  });

  describe("handle event", () => {
    test("using service handlers", async () => {
      const dataEventMock =
        jest.fn<EventHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvent(dataEvent, dataEventMock);
      const execution = await env.startExecution(signalWorkflow, undefined);
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
        status: ExecutionStatus.COMPLETE,
        result: "event data",
      });
    });
  });

  describe("toggle event handler", () => {
    test("disable and enable", async () => {
      env.disableServiceSubscriptions();

      const dataEventMock =
        jest.fn<EventHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvent(dataEvent, dataEventMock);
      const execution = await env.startExecution(signalWorkflow, undefined);
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
        status: ExecutionStatus.COMPLETE,
        result: "event data",
      });

      expect(dataEventMock).toBeCalledTimes(2);
    });

    test("reset subscriptions", async () => {
      const dataEventMock =
        jest.fn<EventHandler<EventPayloadType<typeof dataEvent>>>();
      env.subscribeEvent(dataEvent, dataEventMock);
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
  test("complete", async () => {
    const execution = await env.startExecution(workflow1, undefined);

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.COMPLETE,
      result: "hi",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("complete future", async () => {
    await env.tickUntil("2022-01-01");
    const execution = await env.startExecution(workflow1, undefined);

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.COMPLETE,
      result: "hi",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("fail", async () => {
    const execution = await env.startExecution(errorWorkflow, undefined);

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.FAILED,
      error: "Error",
      message: "failed!",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("complete future", async () => {
    await env.tickUntil("2022-01-01");
    const execution = await env.startExecution(errorWorkflow, undefined);

    const executionResult = await execution.getStatus();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.executionId,
      status: ExecutionStatus.FAILED,
      error: "Error",
      message: "failed!",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });
});

describe("invoke workflow", () => {
  test("call real child", async () => {
    const execution = await env.startExecution(orchestrateWorkflow, undefined);

    await env.tick(100);

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "hello from a workflow",
    });
  });

  test("call real child that throws", async () => {
    const execution = await env.startExecution(orchestrateWorkflow, true);

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
    mockActivity.complete("hello");
    const execution = await env.startExecution(workflowWithTimeouts, undefined);

    await execution.signal(dataSignal, "woo");
    await env.tick(3);

    expect(await execution.getStatus()).toMatchObject<
      Partial<Awaited<ReturnType<typeof execution.getStatus>>>
    >({
      status: ExecutionStatus.COMPLETE,
      result: [
        { status: "fulfilled", value: "hello" },
        { status: "fulfilled", value: "hello" },
        { status: "fulfilled", value: "woo" },
      ],
    });
  });

  test("explicit timeout", async () => {
    mockActivity.timeout();

    const execution = await env.startExecution(workflowWithTimeouts, undefined);
    await execution.signal(dataSignal, "woo");
    await env.tick(4);

    expect(await execution.getStatus()).toMatchObject<
      Partial<Awaited<ReturnType<typeof execution.getStatus>>>
    >({
      status: ExecutionStatus.COMPLETE,
      result: [
        { status: "rejected", reason: new Timeout().toJSON() },
        { status: "rejected", reason: new Timeout().toJSON() },
        { status: "fulfilled", value: "woo" },
      ],
    });
  });

  test("implicit timeout", async () => {
    mockActivity.asyncResult();

    const execution = await env.startExecution(workflowWithTimeouts, undefined);

    await env.tick(70);

    expect(await execution.getStatus()).toMatchObject<
      Partial<Awaited<ReturnType<typeof execution.getStatus>>>
    >({
      status: ExecutionStatus.COMPLETE,
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
    const execution = await env.startExecution(longRunningWorkflow, undefined);

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await longRunningAct.complete({ activityToken, result: { value: "hi" } });
    await env.tick();

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: { value: "hi" },
    });
  });

  test("async activity env completion", async () => {
    const execution = await env.startExecution(longRunningWorkflow, undefined);

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await env.completeActivity<typeof longRunningAct>(activityToken, {
      value: "hi",
    });

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: { value: "hi" },
    });
  });

  test("async activity env fail", async () => {
    const execution = await env.startExecution(longRunningWorkflow, undefined);

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await env.failActivity(activityToken, "SomeError", "SomeMessage");

    expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.FAILED,
      error: "SomeError",
      message: "SomeMessage",
    });
  });

  test("async activity env fail no message", async () => {
    const execution = await env.startExecution(longRunningWorkflow, undefined);

    if (!activityToken) {
      throw new Error("Expected activity token to be set");
    }

    await env.failActivity(activityToken, "SomeError");

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

    test("complete async immediately", async () => {
      mockActivity.complete({ value: "i am a mock" });
      const execution = await env.startExecution(
        longRunningWorkflow,
        undefined
      );

      await env.tick();

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: { value: "i am a mock" },
      });
    });

    test("block", async () => {
      mockActivity.asyncResult();
      const execution = await env.startExecution(
        longRunningWorkflow,
        undefined
      );

      await env.tick(60 * 60);

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: "sleep",
      });
    });

    test("block and complete", async () => {
      let activityToken;
      mockActivity.asyncResult((token) => {
        activityToken = token;
      });
      const execution = await env.startExecution(
        longRunningWorkflow,
        undefined
      );

      await env.tick(60 * 30);

      if (!activityToken) {
        throw new Error("Expected activity token to be set");
      }

      await env.completeActivity(activityToken, {
        value: "hello from the async mock",
      });

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: {
          value: "hello from the async mock",
        },
      });
    });

    test("block and complete once", async () => {
      let activityToken;
      mockActivity
        .asyncResultOnce((token) => {
          activityToken = token;
        })
        .complete({ value: "not async" });
      const execution = await env.startExecution(
        longRunningWorkflow,
        undefined
      );
      const execution2 = await env.startExecution(
        longRunningWorkflow,
        undefined
      );

      await env.tick(60 * 30);

      if (!activityToken) {
        throw new Error("Expected activity token to be set");
      }

      await env.completeActivity(activityToken, {
        value: "hello from the async mock",
      });

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: {
          value: "hello from the async mock",
        },
      });
      expect(await execution2.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: {
          value: "not async",
        },
      });
    });

    test("block and complete after sleep time", async () => {
      let activityToken;
      mockActivity.asyncResult((token) => {
        activityToken = token;
      });
      const execution = await env.startExecution(
        longRunningWorkflow,
        undefined
      );

      await env.tick(60 * 60);

      if (!activityToken) {
        throw new Error("Expected activity token to be set");
      }

      await env.completeActivity(activityToken, {
        value: "hello from the async mock",
      });

      expect(await execution.getStatus()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: "sleep",
      });
    });
  });
});
