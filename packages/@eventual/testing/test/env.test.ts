import { ExecutionStatus } from "@eventual/core";
import path from "path";
import * as url from "url";
import { MockActivity } from "../src/activities-controller.js";
import { TestEnvironment } from "../src/environment.js";
import { activity1, sleepWorkflow, workflow3 } from "./workflow.js";

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
  env.reset();
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

  test("sleep absolute", async () => {
    // start at this date
    env.tickUntil("2022-01-01T12:00:00Z");
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
