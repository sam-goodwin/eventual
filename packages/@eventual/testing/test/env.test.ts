import { jest } from "@jest/globals";
import {
  EventPayloadType,
  Execution,
  ExecutionStatus,
  EventHandler,
} from "@eventual/core";
import path from "path";
import * as url from "url";
import { MockActivity } from "../src/activities-controller.js";
import { TestEnvironment } from "../src/environment.js";
import {
  activity1,
  continueEvent,
  continueSignal,
  dataDoneEvent,
  dataDoneSignal,
  dataEvent,
  dataSignal,
  errorWorkflow,
  orchestrate,
  orchestrateWorkflow,
  signalWorkflow,
  sleepWorkflow,
  workflow1,
  workflow3,
} from "./workflow.js";

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

  await env.start();
});

afterEach(() => {
  env.resetTime();
});

describe("activity", () => {
  test("use real by default", async () => {
    // execution starts
    const result = await env.startExecution(workflow3, undefined);

    // see if the execution has completed
    const r1 = await result.getExecution();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the activity should be done now.
    // note: running real activities uses an async function and may not be done by the next tick
    await env.tick();

    // the workflow should be done now, the activity completed event should have been processed in the `tick`
    const r2 = await result.getExecution();
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
      const r2 = await execution.getExecution();
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
      const r2 = await execution.getExecution();
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
      const r2 = await execution.getExecution();
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
      const r2 = await execution.getExecution();
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
      const r2 = await execution.getExecution();
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
      const r2 = await execution.getExecution();
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
    const r1 = await result.getExecution();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is for 10 seconds and should not be done
    await env.tick();

    console.log(env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await result.getExecution();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // advance 9 seconds, the sleep time (minus 1)
    await env.tick(9);

    const r3 = await result.getExecution();
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
    const r1 = await result.getExecution();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is for 10 seconds and should not be done
    await env.tick();

    console.log(env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await result.getExecution();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // advance 9 seconds, the sleep time (minus 1)
    await env.tick(9);

    const r3 = await result.getExecution();
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
    const r1 = await execution.getExecution();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is for 10 seconds and should not be done
    await env.tick();
    await execution.signal("anySignal", undefined);

    console.log(env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await execution.getExecution();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // advance 9 seconds, the sleep time (minus 1)
    await env.tick(9);

    const r3 = await execution.getExecution();
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
    const r1 = await result.getExecution();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time,
    await env.tick();

    console.log("time", env.time);

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r2 = await result.getExecution();
    expect(r2).toMatchObject<Partial<typeof r2>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // the sleep should end now
    await env.tickUntil("2022-01-02T12:00:00Z");

    const r3 = await result.getExecution();
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
    const r1 = await result.getExecution();
    // we expect it to still be in progress
    expect(r1).toMatchObject<Partial<typeof r1>>({
      status: ExecutionStatus.IN_PROGRESS,
    });

    // progress time, the sleep is triggered
    // note: still need to progress once for the event to be processed
    await env.tick();

    // the workflow still not be done, have 9 more seconds left on the sleep
    const r3 = await result.getExecution();
    expect(r3).toMatchObject<Partial<typeof r3>>({
      status: ExecutionStatus.COMPLETE,
      result: "hello",
    });
  });
});

describe("signal", () => {
  test("wait on signal", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.IN_PROGRESS,
    });
  });

  test("send signal", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    await execution.signal(continueSignal, undefined);

    expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "done!",
    });
  });

  test("signal handler", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    await execution.signal(dataSignal, "override!");

    await execution.signal(continueSignal, undefined);

    expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "override!",
    });
  });

  test("signal handler dispose", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);

    await execution.signal(dataDoneSignal, undefined);

    await execution.signal(dataSignal, "muahahahaha");

    await execution.signal(continueSignal, undefined);

    expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "done!",
    });
  });

  test("workflow send signal", async () => {
    const execution = await env.startExecution(signalWorkflow, undefined);
    const orchestratorExecution = await env.startExecution(orchestrate, {
      targetExecutionId: execution.id,
    });

    await env.tick(3);

    expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "hello from the orchestrator workflow!",
    });
    expect(await orchestratorExecution.getExecution()).toMatchObject<
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
        executionId: execution.id,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.id,
      });
      await env.publishEvent(continueEvent, {
        executionId: execution.id,
      });
      expect(dataEventMock).toBeCalledWith({
        executionId: execution.id,
        data: "event data",
      });
      expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
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
        targetExecutionId: execution.id,
        events: true,
      });

      await env.tick(100);

      expect(dataEventMock).toHaveBeenCalled();

      expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.COMPLETE,
        result: "hello from the orchestrator workflow!",
      });
      expect(await orchestratorExecution.getExecution()).toMatchObject<
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
        executionId: execution.id,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.id,
      });
      await env.publishEvent(continueEvent, {
        executionId: execution.id,
      });
      expect(dataEventMock).toBeCalledWith({
        executionId: execution.id,
        data: "event data",
      });
      expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
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
        executionId: execution.id,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.id,
      });
      await env.publishEvent(continueEvent, {
        executionId: execution.id,
      });
      // the test env handler was called
      expect(dataEventMock).toBeCalledWith({
        executionId: execution.id,
        data: "event data",
      });

      // but the workflow was not progressed by the default subscriptions.
      expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
        status: ExecutionStatus.IN_PROGRESS,
      });

      // enable and try again, the subscriptions should be working now.
      env.enableServiceSubscriptions();
      await env.publishEvent(dataEvent, {
        executionId: execution.id,
        data: "event data",
      });
      await env.publishEvent(dataDoneEvent, {
        executionId: execution.id,
      });
      await env.publishEvent(continueEvent, {
        executionId: execution.id,
      });
      expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
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

    const executionResult = await execution.getExecution();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.id,
      status: ExecutionStatus.COMPLETE,
      result: "hi",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("complete future", async () => {
    await env.tickUntil("2022-01-01");
    const execution = await env.startExecution(workflow1, undefined);

    const executionResult = await execution.getExecution();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.id,
      status: ExecutionStatus.COMPLETE,
      result: "hi",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("fail", async () => {
    const execution = await env.startExecution(errorWorkflow, undefined);

    const executionResult = await execution.getExecution();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.id,
      status: ExecutionStatus.FAILED,
      error: "Error",
      message: "failed!",
      startTime: new Date(env.time.getTime() - 1000).toISOString(),
    });
  });

  test("complete future", async () => {
    await env.tickUntil("2022-01-01");
    const execution = await env.startExecution(errorWorkflow, undefined);

    const executionResult = await execution.getExecution();

    expect(executionResult).toMatchObject<Execution>({
      endTime: env.time.toISOString(),
      id: execution.id,
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

    expect(await execution.getExecution()).toMatchObject<Partial<Execution>>({
      status: ExecutionStatus.COMPLETE,
      result: "hello from a workflow",
    });
  });
});
