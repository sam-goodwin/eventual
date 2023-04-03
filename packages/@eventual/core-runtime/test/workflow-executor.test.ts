/* eslint-disable require-await, no-throw-literal */
import {
  activity,
  condition,
  duration,
  event,
  EventualError,
  expectSignal,
  HeartbeatTimeout,
  onSignal,
  Schedule,
  sendSignal,
  signal,
  time,
  Timeout,
  Workflow,
  workflow as _workflow,
  WorkflowContext,
  WorkflowHandler,
  WorkflowInput,
} from "@eventual/core";
import {
  HistoryEvent,
  Result,
  SignalTargetType,
} from "@eventual/core/internal";
import { WorkflowExecutor, WorkflowResult } from "../src/workflow-executor.js";
import {
  activityCall,
  activityFailed,
  activityHeartbeatTimedOut,
  activityScheduled,
  activitySucceeded,
  awaitTimerCall,
  childWorkflowCall,
  eventsPublished,
  publishEventCall,
  sendSignalCall,
  signalReceived,
  signalSent,
  timerCompleted,
  timerScheduled,
  workflowFailed,
  workflowScheduled,
  workflowSucceeded,
  workflowTimedOut,
} from "./call-util.js";

import "../src/workflow.js";

const eventName = "hello world";

const context: WorkflowContext = {
  workflow: {
    name: "wf1",
  },
  execution: {
    id: "123/",
    name: "wf1#123",
    startTime: "",
  },
};

const workflow = (() => {
  let n = 0;
  return <Input = any, Output = any>(
    handler: WorkflowHandler<Input, Output>
  ) => {
    return _workflow<Input, Output>(`wf${n++}`, handler);
  };
})();

const myActivity = activity("my-activity", async () => {});
const myActivity0 = activity("my-activity-0", async () => {});
const myActivity2 = activity("my-activity-2", async () => {});
const handleErrorActivity = activity("handle-error", async () => {});
const processItemActivity = activity("processItem", (_item?: string) => {});
const beforeActivity = activity("before", (_v: string) => {});
const insideActivity = activity("inside", (_v: string) => {
  return _v;
});
const afterActivity = activity("after", (_v: string) => {});
const testMeActivity = activity("testme", () => {
  return 0;
});
const cwf = workflow(async () => {});

const testTime = new Date().toISOString();

const myWorkflow = workflow(async (event) => {
  try {
    const a = await myActivity(event);

    // dangling - it should still be scheduled
    myActivity0(event);

    const all = (await Promise.all([
      time(testTime),
      myActivity2(event),
    ])) as any;
    return [a, all];
  } catch (err) {
    await handleErrorActivity(err);
    return [];
  }
});

async function execute<W extends Workflow>(
  workflow: W,
  history: HistoryEvent[],
  input: WorkflowInput<W>
) {
  const executor = new WorkflowExecutor(workflow, history);
  return executor.start(input, context);
}

test("no history", async () => {
  await expect(execute(myWorkflow, [], eventName)).resolves.toMatchObject(<
    WorkflowResult
  >{
    calls: [activityCall(myActivity.name, eventName, 0)],
  });
});

test("should continue with result of completed Activity", async () => {
  await expect(
    execute(
      myWorkflow,
      [activityScheduled(myActivity.name, 0), activitySucceeded("result", 0)],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [
      activityCall(myActivity0.name, eventName, 1),
      awaitTimerCall(Schedule.time(testTime), 2),
      activityCall(myActivity2.name, eventName, 3),
    ],
  });
});

test("should fail on workflow timeout event", async () => {
  await expect(
    execute(
      myWorkflow,
      [activityScheduled(myActivity.name, 0), workflowTimedOut()],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Workflow timed out")),
    calls: [],
  });
});

test("should not continue on workflow timeout event", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled(myActivity.name, 0),
        workflowTimedOut(),
        activitySucceeded("result", 0),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Workflow timed out")),
    calls: [],
  });
});

test("should catch error of failed Activity", async () => {
  await expect(
    execute(
      myWorkflow,
      [activityScheduled(myActivity.name, 0), activityFailed("error", 0)],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [
      activityCall("handle-error", new EventualError("error").toJSON(), 1),
    ],
  });
});

test("should catch error of timing out Activity", async () => {
  const myWorkflow = workflow(async (event) => {
    try {
      const a = await myActivity(event, { timeout: time(testTime) });

      return a;
    } catch (err) {
      await handleErrorActivity(err);
      return [];
    }
  });

  await expect(
    execute(
      myWorkflow,
      [
        timerScheduled(0),
        timerCompleted(0),
        activityScheduled(myActivity.name, 1),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [activityCall("handle-error", new Timeout("Activity Timed Out"), 2)],
  });
});

test("immediately abort activity on invalid timeout", async () => {
  const myWorkflow = workflow((event) => {
    return myActivity(event, { timeout: "not a promise" as any });
  });

  await expect(
    execute(myWorkflow, [activityScheduled(myActivity.name, 0)], eventName)
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Activity Timed Out")),
  });
});

test("timeout multiple activities at once", async () => {
  const myWorkflow = workflow(async (event) => {
    const _time = time(testTime);
    const a = myActivity(event, { timeout: _time });
    const b = myActivity(event, { timeout: _time });

    return Promise.allSettled([a, b]);
  });

  await expect(
    execute(
      myWorkflow,
      [
        timerScheduled(0),
        activityScheduled(myActivity.name, 1),
        activityScheduled(myActivity.name, 2),
        timerCompleted(0),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved([
      {
        status: "rejected",
        reason: new Timeout("Activity Timed Out").toJSON(),
      },
      {
        status: "rejected",
        reason: new Timeout("Activity Timed Out").toJSON(),
      },
    ]),
    calls: [],
  });
});

test("activity times out activity", async () => {
  const myWorkflow = workflow(async (event) => {
    const z = myActivity("my-activity", event);
    const a = myActivity(event, { timeout: z });
    const b = myActivity(event, { timeout: a });

    return Promise.allSettled([z, a, b]);
  });

  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled(myActivity.name, 0),
        activityScheduled(myActivity.name, 1),
        activityScheduled(myActivity.name, 2),
        activitySucceeded("woo", 0),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved([
      {
        status: "fulfilled",
        value: "woo",
      },
      {
        status: "rejected",
        reason: new Timeout("Activity Timed Out").toJSON(),
      },
      {
        status: "rejected",
        reason: new Timeout("Activity Timed Out").toJSON(),
      },
    ]),
    calls: [],
  });
});

test("should return final result", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled(myActivity.name, 0),
        activitySucceeded("result", 0),
        activityScheduled(myActivity0.name, 1),
        timerScheduled(2),
        activityScheduled(myActivity2.name, 3),
        activitySucceeded("result-0", 1),
        timerCompleted(2),
        activitySucceeded("result-2", 3),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved(["result", [undefined, "result-2"]]),
    calls: [],
  });
});

test("should handle missing blocks", async () => {
  await expect(
    execute(myWorkflow, [activitySucceeded("result", 0)], eventName)
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [
      activityCall(myActivity.name, eventName, 0),
      activityCall(myActivity0.name, eventName, 1),
      awaitTimerCall(Schedule.time(testTime), 2),
      activityCall(myActivity2.name, eventName, 3),
    ],
  });
});

test("should handle partial blocks", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled(myActivity.name, 0),
        activitySucceeded("result", 0),
        activityScheduled(myActivity0.name, 1),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [
      awaitTimerCall(Schedule.time(testTime), 2),
      activityCall(myActivity2.name, eventName, 3),
    ],
  });
});

test("should handle partial blocks with partial completes", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled(myActivity.name, 0),
        activitySucceeded("result", 0),
        activityScheduled(myActivity0.name, 1),
        activitySucceeded("result", 1),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [
      awaitTimerCall(Schedule.time(testTime), 2),
      activityCall(myActivity2.name, eventName, 3),
    ],
  });
});

test("await constant", async () => {
  const testWorkflow = workflow(async () => {
    return await 1;
  });

  await expect(execute(testWorkflow, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    result: Result.resolved(1),
  });
});
7;
describe("activity", () => {
  const getPumpedActivity = activity("getPumpedUp", () => {});
  describe("heartbeat", () => {
    const wf = workflow(() => {
      return getPumpedActivity(undefined, {
        heartbeatTimeout: Schedule.duration(100),
      });
    });

    test("timeout from heartbeat seconds", async () => {
      await expect(
        execute(
          wf,
          [
            activityScheduled(getPumpedActivity.name, 0),
            activityHeartbeatTimedOut(0, 101),
          ],
          undefined
        )
      ).resolves.toMatchObject<WorkflowResult>({
        result: Result.failed(
          new HeartbeatTimeout("Activity Heartbeat TimedOut")
        ),
        calls: [],
      });
    });

    test("timeout after complete", async () => {
      await expect(
        execute(
          wf,
          [
            activityScheduled(getPumpedActivity.name, 0),
            activitySucceeded("done", 0),
            activityHeartbeatTimedOut(0, 1000),
          ],
          undefined
        )
      ).resolves.toMatchObject<WorkflowResult>({
        result: Result.resolved("done"),
        calls: [],
      });
    });

    test("catch heartbeat timeout", async () => {
      const wf = workflow(async () => {
        try {
          const result = await getPumpedActivity(undefined, {
            heartbeatTimeout: Schedule.duration(1),
          });
          return result;
        } catch (err) {
          if (err instanceof HeartbeatTimeout) {
            return err.message;
          }
          return "no";
        }
      });

      await expect(
        execute(
          wf,
          [
            activityScheduled(getPumpedActivity.name, 0),
            activityHeartbeatTimedOut(0, 10),
          ],
          undefined
        )
      ).resolves.toMatchObject<WorkflowResult>({
        result: Result.resolved("Activity Heartbeat TimedOut"),
        calls: [],
      });
    });
  });
});

test("should throw when scheduled does not correspond to call", async () => {
  await expect(
    execute(myWorkflow, [timerScheduled(0)], eventName)
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "DeterminismError" }),
    calls: [],
  });
});

test("should throw when a completed precedes workflow state", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled(myActivity.name, 0),
        activityScheduled("result", 1),
        // the workflow does not return a seq: 2, where does this go?
        // note: a completed event can be accepted without a "scheduled" counterpart,
        // but the workflow must resolve the schedule before the complete
        // is applied.
        activitySucceeded("", 2),
      ],
      eventName
    )
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "DeterminismError" }),
    calls: [],
  });
});

test("should fail the workflow on uncaught user error", async () => {
  const wf = workflow(() => {
    throw new Error("Hi");
  });

  await expect(
    execute(wf, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "Error", message: "Hi" }),
    calls: [],
  });
});

test("should fail the workflow on uncaught user error of random type", async () => {
  const wf = workflow(() => {
    throw new TypeError("Hi");
  });

  await expect(
    execute(wf, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "TypeError", message: "Hi" }),
    calls: [],
  });
});

// tests a copy of the child workflow from the test-service
test("should fail the workflow on uncaught user error after await", async () => {
  const wf = workflow(async (input: { name: string; parentId: string }) => {
    let block = false;
    let done = false;
    let last = 0;

    if (!input.parentId) {
      throw new Error("I need an adult");
    }

    console.log(`Hi, I am ${input.name}`);

    onSignal<number>("mySignal", (n) => {
      last = n;
      block = false;
    });
    onSignal("doneSignal", () => {
      done = true;
      block = false;
    });

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!done) {
      sendSignal(input.parentId, "mySignal", last + 1);
      block = true;
      if (
        !(await condition({ timeout: duration(10, "seconds") }, () => !block))
      ) {
        throw new Error("timed out!");
      }
    }

    return "done";
  });

  const executor = new WorkflowExecutor(wf, [
    signalSent("parent", "mySignal", 2, 1),
    timerScheduled(3),
  ]);

  await executor.start({ name: "child", parentId: "parent" }, context);

  await expect(
    executor.continue([timerCompleted(3)])
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed(new Error("timed out!")),
    calls: [],
  });
});

test.skip("dangling promise failure", async () => {
  const wf = workflow(async () => {
    myActivity(undefined);

    await condition(() => false);

    return "done";
  });

  const executor = new WorkflowExecutor(wf, [
    activityScheduled(myActivity.name, 0),
  ]);

  await executor.start(undefined, context);

  await expect(
    executor.continue([activityFailed(new Error("AHH"), 0)])
  ).resolves.toMatchObject<WorkflowResult>({
    result: undefined,
    calls: [],
  });
});

test.skip("dangling promise failure with then", async () => {
  const wf = workflow(async () => {
    myActivity(undefined).then(() => {
      console.log("hi");
    });

    await condition(() => false);

    return "done";
  });

  const executor = new WorkflowExecutor(wf, [
    activityScheduled(myActivity.name, 0),
  ]);

  await executor.start(undefined, context);

  await expect(
    executor.continue([activityFailed(new Error("AHH"), 0)])
  ).resolves.toMatchObject<WorkflowResult>({
    result: undefined,
    calls: [],
  });
});

test("dangling promise success", async () => {
  const wf = workflow(async () => {
    myActivity(undefined);

    await condition(() => false);

    return "done";
  });

  const executor = new WorkflowExecutor(wf, [
    activityScheduled(myActivity.name, 0),
  ]);

  await executor.start(undefined, context);

  await expect(
    executor.continue([activitySucceeded("ahhh", 0)])
  ).resolves.toMatchObject<WorkflowResult>({
    result: undefined,
    calls: [],
  });
});

test("should fail the workflow on uncaught thrown value", async () => {
  const wf = workflow(() => {
    throw "hi";
  });
  await expect(
    execute(wf, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed("hi"),
    calls: [],
  });
});

test("should wait if partial results", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled(myActivity.name, 0),
        activitySucceeded("result", 0),
        activityScheduled(myActivity0.name, 1),
        timerScheduled(2),
        activityScheduled(myActivity2.name, 3),
        activitySucceeded("result-0", 1),
        timerCompleted(2),
      ],
      eventName
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [],
  });
});

test("should return result of inner function", async () => {
  const wf = workflow(async () => {
    const inner = async () => {
      return "foo";
    };

    return await inner();
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    result: Result.resolved("foo"),
    calls: [],
  });
});

test("should schedule duration", async () => {
  const wf = workflow(async () => {
    await duration(10);
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    calls: [awaitTimerCall(Schedule.duration(10), 0)],
  });
});

test("should not re-schedule duration", async () => {
  const wf = workflow(async () => {
    await duration(10);
  });

  await expect(
    execute(wf, [timerScheduled(0)], undefined)
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [],
  });
});

test("should complete duration", async () => {
  const wf = workflow(async () => {
    await duration(10);
    return "done";
  });

  await expect(
    execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved("done"),
    calls: [],
  });
});

test("should schedule time", async () => {
  const now = new Date();

  const wf = workflow(async () => {
    await time(now);
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    calls: [awaitTimerCall(Schedule.time(now.toISOString()), 0)],
  });
});

test("should not re-schedule time", async () => {
  const now = new Date();

  const wf = workflow(async () => {
    await time(now);
  });

  await expect(
    execute(wf, [timerScheduled(0)], undefined)
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [],
  });
});

test("should complete time", async () => {
  const now = new Date();

  const wf = workflow(async () => {
    await time(now);
    return "done";
  });

  await expect(
    execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved("done"),
    calls: [],
  });
});

const jumpActivity = activity("jump", () => {});
const runActivity = activity("run", () => {});

describe("temple of doom", () => {
  /**
   * In our game, the player wants to get to the end of a hallway with traps.
   * The trap starts above the player and moves to a space in front of them
   * after a time("X").
   *
   * If the trap has moved (X time), the player may jump to avoid it.
   * If the player jumps when then trap has not moved, they will beheaded.
   * If the player runs when the trap has been triggered without jumping, they will have their legs cut off.
   *
   * The trap is represented by a timer command for X time.
   * The player starts running by returning the "run" activity.
   * The player jumps be returning the "jump" activity.
   * (this would be better modeled with signals and conditions, but the effect is the same, wait, complete)
   *
   * Jumping after avoid the trap has no effect.
   */
  const doomWf = workflow(async () => {
    let trapDown = false;
    let jump = false;

    async function startTrap() {
      await time(testTime);
      trapDown = true;
    }

    async function waitForJump() {
      await jumpActivity();
      jump = true;
    }

    startTrap();
    // the player can jump now
    waitForJump();

    await runActivity();

    if (jump) {
      if (!trapDown) {
        return "dead: beheaded";
      }
      return "alive: party";
    } else {
      if (trapDown) {
        return "dead: lost your feet";
      }
      return "alive";
    }
  });

  test("run until blocked", async () => {
    await expect(execute(doomWf, [], undefined)).resolves.toMatchObject(<
      WorkflowResult
    >{
      calls: [
        awaitTimerCall(Schedule.time(testTime), 0),
        activityCall("jump", undefined, 1),
        activityCall("run", undefined, 2),
      ],
    });
  });

  test("waiting", async () => {
    await expect(
      execute(
        doomWf,
        [
          timerScheduled(0),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      calls: [],
    });
  });

  test("trap triggers, player has not started, nothing happens", async () => {
    // complete timer, nothing happens
    await expect(
      execute(
        doomWf,
        [
          timerScheduled(0),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
          timerCompleted(0),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      calls: [],
    });
  });

  test("trap triggers and then the player starts, player is dead", async () => {
    // complete timer, turn on, release the player, dead
    await expect(
      execute(
        doomWf,
        [
          timerScheduled(0),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
          timerCompleted(0),
          activitySucceeded("anything", 2),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("dead: lost your feet"),
      calls: [],
    });
  });

  test("trap triggers and then the player starts, player is dead, commands are out of order", async () => {
    // complete timer, turn on, release the player, dead
    await expect(
      execute(
        doomWf,
        [
          timerCompleted(0),
          activitySucceeded("anything", 2),
          timerScheduled(0),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("dead: lost your feet"),
      calls: [],
    });
  });

  test("player starts and the trap has not triggered", async () => {
    // release the player, not on, alive
    await expect(
      execute(
        doomWf,
        [
          timerScheduled(0),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
          activitySucceeded("anything", 2),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      calls: [],
    });
  });

  test("player starts and the trap has not triggered, completed before activity", async () => {
    // release the player, not on, alive
    await expect(
      execute(
        doomWf,
        [
          timerScheduled(0),
          activitySucceeded("anything", 2),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      calls: [],
    });
  });

  test("player starts and the trap has not triggered, completed before any command", async () => {
    // release the player, not on, alive
    await expect(
      execute(
        doomWf,
        [
          activitySucceeded("anything", 2),
          timerScheduled(0),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      calls: [],
    });
  });

  test("release the player before the trap triggers, player lives", async () => {
    await expect(
      execute(
        doomWf,
        [
          timerScheduled(0),
          activityScheduled("jump", 1),
          activityScheduled("run", 2),
          activitySucceeded("anything", 2),
          timerCompleted(0),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      calls: [],
    });
  });
});

test("should await an un-awaited returned Activity", async () => {
  const wf = workflow(async () => {
    async function inner() {
      return "foo";
    }
    return inner();
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    result: Result.resolved("foo"),
    calls: [],
  });
});

describe("AwaitAll", () => {
  test("should await an un-awaited returned AwaitAll", async () => {
    const wf = workflow(() => {
      let i = 0;
      function inner() {
        return `foo-${i++}`;
      }
      return Promise.all([inner(), inner()]);
    });

    await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
      WorkflowResult
    >{
      result: Result.resolved(["foo-0", "foo-1"]),
      calls: [],
    });
  });

  test("should return constants", async () => {
    const wf = workflow(() => {
      return Promise.all([1 as any, 1 as any]);
    });

    await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
      WorkflowResult
    >{
      result: Result.resolved([1, 1]),
      calls: [],
    });
  });

  test("should support already awaited or awaited eventuals", async () => {
    const wf = workflow(async () => {
      return Promise.all([
        await processItemActivity(undefined),
        await processItemActivity(undefined),
      ]);
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded(1, 0),
          activitySucceeded(1, 1),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved([1, 1]),
      calls: [],
    });
  });

  test("should support Promise.all of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.all(
        items.map(async (item) => {
          return await processItemActivity(item);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      calls: [
        activityCall(processItemActivity.name, "a", 0),
        activityCall(processItemActivity.name, "b", 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("A", 0),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved(["A", "B"]),
    });
  });

  test("should have left-to-right determinism semantics for Promise.all", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.all([
        beforeActivity("before"),
        ...items.map(async (item) => {
          await insideActivity(item);
        }),
        afterActivity("after"),
      ]);
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      calls: [
        activityCall("before", "before", 0),
        activityCall("inside", "a", 1),
        activityCall("inside", "b", 2),
        activityCall("after", "after", 3),
      ],
    });
  });
});

describe("AwaitAny", () => {
  test("should await an un-awaited returned AwaitAny", async () => {
    const wf = workflow(async () => {
      let i = 0;
      function inner() {
        return `foo-${i++}`;
      }
      return Promise.any([inner(), inner()]);
    });

    await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
      WorkflowResult
    >{
      result: Result.resolved("foo-0"),
      calls: [],
    });
  });

  test("should support Promise.any of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.any(
        items.map(async (item) => {
          return await processItemActivity(item);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      calls: [
        activityCall(processItemActivity.name, "a", 0),
        activityCall(processItemActivity.name, "b", 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("A", 0),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("A", 0),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("B"),
    });
  });

  test("should ignore failures when one failed", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.any(
        items.map(async (item) => {
          return await processItemActivity(item);
        })
      );
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("A", 0),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("B"),
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("A", 0),
          activityFailed("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("B", 1),
          activitySucceeded("A", 0),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });
  });

  test("should fail when all fail", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.any(
        items.map(async (item) => {
          return await processItemActivity(item);
        })
      );
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("A", 0),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: undefined,
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("A", 0),
          activityFailed("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      // @ts-ignore - AggregateError not available?
      result: Result.failed(
        new AggregateError(["A", "B"], "All promises were rejected")
      ),
    });
  });
});

describe("Race", () => {
  test("should await an un-awaited returned Race", async () => {
    const wf = workflow(async () => {
      let i = 0;
      async function inner() {
        return `foo-${i++}`;
      }
      return Promise.race([inner(), inner()]);
    });

    await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
      WorkflowResult
    >{
      result: Result.resolved("foo-0"),
      calls: [],
    });
  });

  test("should support Promise.race of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.race(
        items.map(async (item) => {
          return await processItemActivity(item);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      calls: [
        activityCall(processItemActivity.name, "a", 0),
        activityCall(processItemActivity.name, "b", 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("A", 0),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("A", 0),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved("B"),
    });
  });

  test("should return any settled call", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.race(
        items.map(async (item) => {
          return await processItemActivity(item);
        })
      );
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("A", 0),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.failed(new EventualError("A").toJSON()),
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.failed(new EventualError("B").toJSON()),
    });
  });
});

describe("AwaitAllSettled", () => {
  test("should await an un-awaited returned AwaitAllSettled", async () => {
    const wf = workflow(async () => {
      let i = 0;
      async function inner() {
        return `foo-${i++}`;
      }
      return Promise.allSettled([inner(), inner()]);
    });

    await expect(execute(wf, [], undefined)).resolves.toMatchObject<
      WorkflowResult<PromiseSettledResult<string>[]>
    >({
      result: Result.resolved([
        { status: "fulfilled", value: "foo-0" },
        { status: "fulfilled", value: "foo-1" },
      ]),
      calls: [],
    });
  });

  test("should support Promise.allSettled of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.allSettled(
        items.map(async (item) => {
          return await processItemActivity(item);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject<
      WorkflowResult<PromiseSettledResult<string>[]>
    >({
      calls: [
        activityCall(processItemActivity.name, "a", 0),
        activityCall(processItemActivity.name, "b", 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activitySucceeded("A", 0),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject<WorkflowResult<PromiseSettledResult<string>[]>>({
      result: Result.resolved([
        { status: "fulfilled", value: "A" },
        { status: "fulfilled", value: "B" },
      ]),
      calls: [],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("A", 0),
          activityFailed("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject<WorkflowResult<PromiseSettledResult<string>[]>>({
      result: Result.resolved([
        { status: "rejected", reason: new EventualError("A").toJSON() },
        { status: "rejected", reason: new EventualError("B").toJSON() },
      ]),
      calls: [],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(processItemActivity.name, 0),
          activityScheduled(processItemActivity.name, 1),
          activityFailed("A", 0),
          activitySucceeded("B", 1),
        ],
        ["a", "b"]
      )
    ).resolves.toMatchObject<WorkflowResult<PromiseSettledResult<string>[]>>({
      result: Result.resolved([
        { status: "rejected", reason: new EventualError("A").toJSON() },
        { status: "fulfilled", value: "B" },
      ]),
      calls: [],
    });
  });
});

const catchActivity = activity("catch", () => {});
const finallyActivity = activity("finally", () => {});

test("try-catch-finally with await in catch", async () => {
  const wf = workflow(async () => {
    try {
      throw new Error("error");
    } catch {
      await catchActivity();
    } finally {
      await finallyActivity();
    }
  });
  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    calls: [activityCall("catch", undefined, 0)],
  });
  await expect(
    execute(
      wf,
      [activityScheduled("catch", 0), activitySucceeded(undefined, 0)],
      undefined
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [activityCall("finally", undefined, 1)],
  });
});

test("try-catch-finally with dangling promise in catch", async () => {
  await expect(
    execute(
      workflow(async () => {
        try {
          throw new Error("error");
        } catch {
          catchActivity();
        } finally {
          await finallyActivity();
        }
      }),
      [],
      undefined
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [
      activityCall("catch", undefined, 0),
      activityCall("finally", undefined, 1),
    ],
  });
});

test("throw error within nested function", async () => {
  const wf = workflow(async (items: string[]) => {
    try {
      await Promise.all(
        items.map(async (item) => {
          const result = await insideActivity(item);

          if (result === "bad") {
            throw new Error("bad");
          }
        })
      );
    } catch {
      await catchActivity();
      return "returned in catch"; // this should be trumped by the finally
    } finally {
      await finallyActivity();
      // eslint-disable-next-line no-unsafe-finally
      return "returned in finally";
    }
  });
  await expect(execute(wf, [], ["good", "bad"])).resolves.toMatchObject(<
    WorkflowResult
  >{
    calls: [
      activityCall("inside", "good", 0),
      activityCall("inside", "bad", 1),
    ],
  });
  await expect(
    execute(
      wf,
      [
        activityScheduled("inside", 0),
        activityScheduled("inside", 1),
        activitySucceeded("good", 0),
        activitySucceeded("bad", 1),
      ],
      ["good", "bad"]
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [activityCall("catch", undefined, 2)],
  });
  await expect(
    execute(
      wf,
      [
        activityScheduled("inside", 0),
        activityScheduled("inside", 1),
        activitySucceeded("good", 0),
        activitySucceeded("bad", 1),
        activityScheduled("catch", 2),
        activitySucceeded("catch", 2),
      ],
      ["good", "bad"]
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    calls: [activityCall("finally", undefined, 3)],
  });
  await expect(
    execute(
      wf,
      [
        activityScheduled("inside", 0),
        activityScheduled("inside", 1),
        activitySucceeded("good", 0),
        activitySucceeded("bad", 1),
        activityScheduled("catch", 2),
        activitySucceeded("catch", 2),
        activityScheduled("finally", 3),
        activitySucceeded("finally", 3),
      ],
      ["good", "bad"]
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved("returned in finally"),
    calls: [],
  });
});

test("properly evaluate await of sub-programs", async () => {
  async function sub() {
    const item = await Promise.all([myActivity0(), myActivity2()]);

    return item;
  }

  const wf = workflow(async () => {
    return await sub();
  });

  await expect(
    execute(wf, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [
      //
      activityCall(myActivity0.name, undefined, 0),
      activityCall(myActivity2.name, undefined, 1),
    ],
  });

  await expect(
    execute(
      wf,
      [
        activityScheduled(myActivity0.name, 0),
        activityScheduled(myActivity2.name, 1),
        activitySucceeded("a", 0),
        activitySucceeded("b", 1),
      ],
      undefined
    )
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.resolved(["a", "b"]),
    calls: [],
  });
});

test("properly evaluate await of Promise.all", async () => {
  const wf = workflow(async () => {
    const item = await Promise.all([myActivity0(), myActivity2()]);

    return item;
  });

  await expect(
    execute(wf, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [
      //
      activityCall(myActivity0.name, undefined, 0),
      activityCall(myActivity2.name, undefined, 1),
    ],
  });

  await expect(
    execute(
      wf,
      [
        activityScheduled(myActivity0.name, 0),
        activityScheduled(myActivity2.name, 1),
        activitySucceeded("a", 0),
        activitySucceeded("b", 1),
      ],
      undefined
    )
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.resolved(["a", "b"]),
    calls: [],
  });
});

test("generator function returns an ActivityCall", async () => {
  const wf = workflow(async () => {
    return await sub();
  });

  async function sub() {
    return myActivity();
  }

  await expect(
    execute(wf, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [activityCall(myActivity.name, undefined, 0)],
  });
  await expect(
    execute(
      wf,
      [activityScheduled(myActivity.name, 0), activitySucceeded("result", 0)],
      undefined
    )
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.resolved("result"),
    calls: [],
  });
});

test("workflow calling other workflow", async () => {
  const wf1 = workflow(async () => {
    await myActivity();
  });
  const wf2 = workflow(async () => {
    const result = (await wf1()) as any;
    await myActivity0();
    return result;
  });

  await expect(
    execute(wf2, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [childWorkflowCall(wf1.name, undefined, 0)],
  });

  await expect(
    execute(wf2, [workflowScheduled(wf1.name, 0)], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [],
  });

  await expect(
    execute(
      wf2,
      [workflowScheduled(wf1.name, 0), workflowSucceeded("result", 0)],
      undefined
    )
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [activityCall(myActivity0.name, undefined, 1)],
  });

  await expect(
    execute(
      wf2,
      [
        workflowScheduled(wf1.name, 0),
        workflowSucceeded("result", 0),
        activityScheduled(myActivity0.name, 1),
      ],
      undefined
    )
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [],
  });

  await expect(
    execute(
      wf2,
      [
        workflowScheduled(wf1.name, 0),
        workflowSucceeded("result", 0),
        activityScheduled(myActivity0.name, 1),
        activitySucceeded(undefined, 1),
      ],
      undefined
    )
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.resolved("result"),
    calls: [],
  });

  await expect(
    execute(
      wf2,
      [workflowScheduled(wf1.name, 0), workflowFailed("error", 0)],
      undefined
    )
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed(new EventualError("error").toJSON()),
    calls: [],
  });
});

describe("signals", () => {
  describe("expect signal", () => {
    const wf = workflow(async () => {
      const result = await expectSignal("MySignal", {
        timeout: duration(100 * 1000, "seconds"),
      });

      return result ?? "done";
    });

    test("start expect signal", async () => {
      await expect(
        execute(wf, [], undefined)
      ).resolves.toMatchObject<WorkflowResult>({
        calls: [awaitTimerCall(Schedule.duration(100 * 1000), 0)],
      });
    });

    test("no signal", async () => {
      await expect(
        execute(wf, [timerScheduled(0)], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        calls: [],
      });
    });

    test("match signal", async () => {
      await expect(
        execute(wf, [timerScheduled(0), signalReceived("MySignal")], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        calls: [],
      });
    });

    test("match signal with payload", async () => {
      await expect(
        execute(
          wf,
          [timerScheduled(0), signalReceived("MySignal", { done: true })],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({ done: true }),
        calls: [],
      });
    });

    test("timed out", async () => {
      await expect(
        execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.failed(new Timeout("Expect Signal Timed Out")),
        calls: [],
      });
    });

    test("timed out then signal", async () => {
      await expect(
        execute(
          wf,
          [
            timerScheduled(0),
            timerCompleted(0),
            signalReceived("MySignal", { done: true }),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.failed(new Timeout("Expect Signal Timed Out")),
        calls: [],
      });
    });

    test("match signal then timeout", async () => {
      await expect(
        execute(
          wf,
          [timerScheduled(0), signalReceived("MySignal"), timerCompleted(0)],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        calls: [],
      });
    });

    test("match signal twice", async () => {
      await expect(
        execute(
          wf,
          [
            timerScheduled(0),
            signalReceived("MySignal"),
            signalReceived("MySignal"),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        calls: [],
      });
    });

    test("multiple of the same signal", async () => {
      const wf = workflow(async () => {
        const wait1 = expectSignal("MySignal", {
          timeout: duration(100 * 1000, "seconds"),
        });
        const wait2 = expectSignal("MySignal", {
          timeout: duration(100 * 1000, "seconds"),
        });

        return Promise.all([wait1, wait2]);
      });

      await expect(
        execute(
          wf,
          [
            timerScheduled(0),
            timerScheduled(2),
            signalReceived("MySignal", "done!!!"),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved(["done!!!", "done!!!"]),
        calls: [],
      });
    });

    test("expect then timeout", async () => {
      const wf = workflow(async () => {
        await expectSignal("MySignal", {
          timeout: duration(100 * 1000, "seconds"),
        });
        await expectSignal("MySignal", {
          timeout: duration(100 * 1000, "seconds"),
        });
      });

      await expect(
        execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.failed({ name: "Timeout" }),
        calls: [],
      });
    });

    test("expect random signal then timeout", async () => {
      const wf = workflow(async () => {
        await expectSignal("MySignal", {
          timeout: duration(100 * 1000, "seconds"),
        });
        await expectSignal("MySignal", {
          timeout: duration(100 * 1000, "seconds"),
        });
      });

      await expect(
        execute(
          wf,
          [
            timerScheduled(0),
            signalReceived("SomethingElse"),
            timerCompleted(0),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.failed({ name: "Timeout" }),
        calls: [],
      });
    });
  });

  describe("signal handler", () => {
    const wf = workflow(async () => {
      let mySignalHappened = 0;
      let myOtherSignalHappened = 0;
      let myOtherSignalCompleted = 0;
      const mySignalHandler = onSignal(
        "MySignal",
        // the transformer will turn this closure into a generator wrapped in chain
        function () {
          mySignalHappened++;
        }
      );
      const myOtherSignalHandler = onSignal(
        "MyOtherSignal",
        async function (payload) {
          myOtherSignalHappened++;
          await myActivity(payload);
          myOtherSignalCompleted++;
        }
      );

      await time(testTime);

      mySignalHandler.dispose();
      myOtherSignalHandler.dispose();

      await time(testTime);

      return {
        mySignalHappened,
        myOtherSignalHappened,
        myOtherSignalCompleted,
      };
    });

    test("start", async () => {
      await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
        WorkflowResult
      >{
        calls: [awaitTimerCall(Schedule.time(testTime), 2)],
      });
    });

    test("send signal, do not wake up", async () => {
      await expect(
        execute(wf, [signalReceived("MySignal")], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        calls: [awaitTimerCall(Schedule.time(testTime), 2)],
      });
    });

    test("send signal, wake up", async () => {
      await expect(
        execute(
          wf,
          [
            signalReceived("MySignal"),
            timerScheduled(2),
            timerCompleted(2),
            timerScheduled(3),
            timerCompleted(3),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 1,
          myOtherSignalHappened: 0,
          myOtherSignalCompleted: 0,
        }),
        calls: [],
      });
    });

    test("send multiple signal, wake up", async () => {
      await expect(
        execute(
          wf,
          [
            signalReceived("MySignal"),
            signalReceived("MySignal"),
            signalReceived("MySignal"),
            timerScheduled(2),
            timerCompleted(2),
            timerScheduled(3),
            timerCompleted(3),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 3,
          myOtherSignalHappened: 0,
          myOtherSignalCompleted: 0,
        }),
        calls: [],
      });
    });

    test("send signal after dispose", async () => {
      await expect(
        execute(
          wf,
          [
            timerScheduled(2),
            timerCompleted(2),
            signalReceived("MySignal"),
            signalReceived("MySignal"),
            signalReceived("MySignal"),
            timerScheduled(3),
            timerCompleted(3),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 0,
          myOtherSignalCompleted: 0,
        }),
        calls: [],
      });
    });

    test("send other signal, do not complete", async () => {
      await expect(
        execute(wf, [signalReceived("MyOtherSignal", "hi")], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        calls: [
          awaitTimerCall(Schedule.time(testTime), 2),
          activityCall(myActivity.name, "hi", 3),
        ],
      });
    });

    test("send multiple other signal, do not complete", async () => {
      await expect(
        execute(
          wf,
          [
            signalReceived("MyOtherSignal", "hi"),
            signalReceived("MyOtherSignal", "hi2"),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        calls: [
          awaitTimerCall(Schedule.time(testTime), 2),
          activityCall(myActivity.name, "hi", 3),
          activityCall(myActivity.name, "hi2", 4),
        ],
      });
    });

    test("send other signal, wake timer, with act scheduled", async () => {
      await expect(
        execute(
          wf,
          [
            signalReceived("MyOtherSignal", "hi"),
            timerScheduled(2),
            timerCompleted(2),
            activityScheduled(myActivity.name, 3),
            timerScheduled(4),
            timerCompleted(4),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 1,
          myOtherSignalCompleted: 0,
        }),
        calls: [],
      });
    });

    test("send other signal, wake timer, complete activity", async () => {
      await expect(
        execute(
          wf,
          [
            signalReceived("MyOtherSignal", "hi"),
            timerScheduled(2),
            activityScheduled(myActivity.name, 3),
            activitySucceeded("act1", 3),
            timerCompleted(2),
            timerScheduled(4),
            timerCompleted(4),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 1,
          myOtherSignalCompleted: 1,
        }),
        calls: [],
      });
    });

    test("send other signal, wake timer, complete activity after dispose", async () => {
      await expect(
        execute(
          wf,
          [
            signalReceived("MyOtherSignal", "hi"),
            timerScheduled(2),
            timerCompleted(2),
            activityScheduled(myActivity.name, 3),
            activitySucceeded("act1", 3),
            timerScheduled(4),
            timerCompleted(4),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 1,
          myOtherSignalCompleted: 1,
        }),
        calls: [],
      });
    });

    test("send other signal after dispose", async () => {
      await expect(
        execute(
          wf,
          [
            timerScheduled(2),
            timerCompleted(2),
            signalReceived("MyOtherSignal", "hi"),
            timerScheduled(3),
            timerCompleted(3),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 0,
          myOtherSignalCompleted: 0,
        }),
        calls: [],
      });
    });
  });

  describe("send signal", () => {
    const mySignal = signal("MySignal");
    const wf = workflow(async () => {
      mySignal.sendSignal("someExecution/");

      const childWorkflow = cwf();

      childWorkflow.sendSignal(mySignal);

      return await childWorkflow;
    });

    test("start", async () => {
      await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
        WorkflowResult
      >{
        calls: [
          sendSignalCall(
            {
              type: SignalTargetType.Execution,
              executionId: "someExecution/",
            },
            "MySignal",
            0
          ),
          childWorkflowCall(cwf.name, undefined, 1),
          sendSignalCall(
            {
              type: SignalTargetType.ChildExecution,
              workflowName: cwf.name,
              seq: 1,
            },
            "MySignal",
            2
          ),
        ],
      });
    });

    test("partial", async () => {
      await expect(
        execute(wf, [signalSent("someExec", "MySignal", 0)], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        calls: [
          childWorkflowCall(cwf.name, undefined, 1),
          sendSignalCall(
            {
              type: SignalTargetType.ChildExecution,
              workflowName: cwf.name,
              seq: 1,
            },
            "MySignal",
            2
          ),
        ],
      });
    });

    test("matching scheduled events", async () => {
      await expect(
        execute(
          wf,
          [
            signalSent("someExec", "MySignal", 0),
            workflowScheduled(cwf.name, 1),
            signalSent("someExecution/", "MySignal", 2),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        calls: [],
      });
    });

    test("complete", async () => {
      await expect(
        execute(
          wf,
          [
            signalSent("someExec", "MySignal", 0),
            workflowScheduled(cwf.name, 1),
            signalSent("someExecution/", "MySignal", 2),
            workflowSucceeded("done", 1),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        calls: [],
      });
    });

    test("sendSignal then", async () => {
      const wf = workflow(async () => {
        console.log("before signal");
        return mySignal.sendSignal("someExecution/").then(async () => {
          console.log("after signal");

          const childWorkflow = cwf();

          await childWorkflow.sendSignal(mySignal);

          return await childWorkflow;
        });
      });

      await expect(
        execute(
          wf,
          [
            signalSent("someExec", "MySignal", 0),
            workflowScheduled(cwf.name, 1),
            signalSent("someExecution/", "MySignal", 2),
            workflowSucceeded("done", 1),
          ],
          undefined
        )
      ).resolves.toEqual(<WorkflowResult>{
        result: Result.resolved("done"),
        calls: [],
      });
    });

    test("awaited sendSignal does nothing 2", async () => {
      const wf = workflow(async () => {
        console.log("before signal");
        await mySignal.sendSignal("someExecution/");

        console.log("after signal");

        const childWorkflow = cwf();

        await childWorkflow.sendSignal(mySignal);

        return await childWorkflow;
      });

      await expect(
        execute(
          wf,
          [
            signalSent("someExec", "MySignal", 0),
            workflowScheduled(cwf.name, 1),
            signalSent("someExecution/", "MySignal", 2),
            workflowSucceeded("done", 1),
          ],
          undefined
        )
      ).resolves.toEqual(<WorkflowResult>{
        result: Result.resolved("done"),
        calls: [],
      });
    });
  });
});

describe("condition", () => {
  test("already true condition does not emit events", async () => {
    const wf = workflow(async () => {
      await condition(() => true);
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      calls: [],
    });
  });

  test("false condition emits events", async () => {
    const wf = workflow(async () => {
      await condition(() => false);
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      calls: [],
    });
  });

  test("false condition emits events with timeout", async () => {
    const wf = workflow(async () => {
      await condition({ timeout: duration(100, "seconds") }, () => false);
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      calls: [awaitTimerCall(Schedule.duration(100), 0)],
    });
  });

  test("false condition does not re-emit", async () => {
    const wf = workflow(async () => {
      await condition({ timeout: duration(100, "seconds") }, () => false);
    });

    await expect(
      execute(wf, [timerScheduled(0)], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      calls: [],
    });
  });

  const signalConditionFlow = workflow(async () => {
    let yes = false;
    onSignal("Yes", () => {
      yes = true;
    });
    if (!(await condition({ timeout: duration(100, "seconds") }, () => yes))) {
      return "timed out";
    }
    return "done";
  });

  test("trigger success", async () => {
    await expect(
      execute(
        signalConditionFlow,
        [timerScheduled(1), signalReceived("Yes")],
        undefined
      )
    ).resolves.toMatchObject<WorkflowResult>({
      result: Result.resolved("done"),
      calls: [],
    });
  });

  test("trigger success eventually", async () => {
    await expect(
      execute(
        signalConditionFlow,
        [
          timerScheduled(1),
          signalReceived("No"),
          signalReceived("No"),
          signalReceived("No"),
          signalReceived("No"),
          signalReceived("Yes"),
        ],
        undefined
      )
    ).resolves.toMatchObject<WorkflowResult>({
      result: Result.resolved("done"),
      calls: [],
    });
  });

  test("never trigger when state changes", async () => {
    const signalConditionOnAndOffFlow = workflow(async () => {
      let yes = false;
      onSignal("Yes", () => {
        yes = true;
      });
      onSignal("Yes", () => {
        yes = false;
      });
      await condition(() => yes);
      return "done";
    });

    await expect(
      execute(signalConditionOnAndOffFlow, [signalReceived("Yes")], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      calls: [],
    });
  });

  test("trigger timeout", async () => {
    await expect(
      execute(
        signalConditionFlow,
        [timerScheduled(1), timerCompleted(1)],
        undefined
      )
    ).resolves.toMatchObject<WorkflowResult>({
      result: Result.resolved("timed out"),
      calls: [],
    });
  });

  test("trigger success before timeout", async () => {
    await expect(
      execute(
        signalConditionFlow,
        [timerScheduled(1), signalReceived("Yes"), timerCompleted(1)],
        undefined
      )
    ).resolves.toMatchObject<WorkflowResult>({
      result: Result.resolved("done"),
      calls: [],
    });
  });

  test("trigger timeout before success", async () => {
    await expect(
      execute(
        signalConditionFlow,
        [timerScheduled(1), timerCompleted(1), signalReceived("Yes")],
        undefined
      )
    ).resolves.toMatchObject<WorkflowResult>({
      result: Result.resolved("timed out"),
      calls: [],
    });
  });

  test("condition as simple generator", async () => {
    const wf = workflow(async () => {
      await condition(() => false);
      return "done";
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      calls: [],
    });
  });
});

test("nestedChains", async () => {
  const wf = workflow(async () => {
    const funcs = {
      a: async () => {
        await time(testTime);
      },
    };

    Object.fromEntries(
      await Promise.all(
        Object.entries(funcs).map(async ([name, func]) => {
          return [name, await func()];
        })
      )
    );
  });

  await expect(
    execute(wf, [], undefined)
  ).resolves.toMatchObject<WorkflowResult>({
    calls: [awaitTimerCall(Schedule.time(testTime), 0)],
  });
});

const helloActivity = activity("hello", (_names: string[]) => {
  return 0;
});

test("mixing closure types", async () => {
  const workflow4 = workflow(async () => {
    const greetings = Promise.all(
      ["sam", "chris", "sam"].map((name) => helloActivity([name]))
    );
    const greetings2 = Promise.all(
      ["sam", "chris", "sam"].map(async (name) => {
        const greeting = await helloActivity([name]);
        return greeting * 2;
      })
    );
    const greetings3 = Promise.all([
      helloActivity(["sam"]),
      helloActivity(["chris"]),
      helloActivity(["sam"]),
    ]);
    return Promise.all([greetings, greetings2, greetings3]);
  });

  await expect(
    execute(workflow4, [], undefined)
  ).resolves.toEqual<WorkflowResult>({
    calls: [
      activityCall("hello", ["sam"], 0),
      activityCall("hello", ["chris"], 1),
      activityCall("hello", ["sam"], 2),
      activityCall("hello", ["sam"], 3),
      activityCall("hello", ["chris"], 4),
      activityCall("hello", ["sam"], 5),
      activityCall("hello", ["sam"], 6),
      activityCall("hello", ["chris"], 7),
      activityCall("hello", ["sam"], 8),
    ],
  });

  await expect(
    execute(
      workflow4,
      [
        activityScheduled(helloActivity.name, 0),
        activityScheduled(helloActivity.name, 1),
        activityScheduled(helloActivity.name, 2),
        activityScheduled(helloActivity.name, 3),
        activityScheduled(helloActivity.name, 4),
        activityScheduled(helloActivity.name, 5),
        activityScheduled(helloActivity.name, 6),
        activityScheduled(helloActivity.name, 7),
        activityScheduled(helloActivity.name, 8),
      ],
      undefined
    )
  ).resolves.toEqual<WorkflowResult>({
    calls: [],
  });

  await expect(
    execute(
      workflow4,
      [
        activityScheduled(helloActivity.name, 0),
        activityScheduled(helloActivity.name, 1),
        activityScheduled(helloActivity.name, 2),
        activityScheduled(helloActivity.name, 3),
        activityScheduled(helloActivity.name, 4),
        activityScheduled(helloActivity.name, 5),
        activityScheduled(helloActivity.name, 6),
        activityScheduled(helloActivity.name, 7),
        activityScheduled(helloActivity.name, 8),
        activitySucceeded(1, 0),
        activitySucceeded(2, 1),
        activitySucceeded(3, 2),
        activitySucceeded(4, 3),
        activitySucceeded(5, 4),
        activitySucceeded(6, 5),
        activitySucceeded(7, 6),
        activitySucceeded(8, 7),
        activitySucceeded(9, 8),
      ],
      undefined
    )
  ).resolves.toEqual<WorkflowResult>({
    result: Result.resolved([
      [1, 2, 3],
      [8, 10, 12],
      [7, 8, 9],
    ]),
    calls: [],
  });
});

test("workflow with synchronous function", async () => {
  const workflow4 = workflow(function () {
    return myActivity();
  });

  await expect(
    execute(workflow4, [], undefined)
  ).resolves.toEqual<WorkflowResult>({
    calls: [activityCall(myActivity.name, undefined, 0)],
  });

  await expect(
    execute(
      workflow4,
      [activityScheduled(myActivity.name, 0), activitySucceeded("result", 0)],
      undefined
    )
  ).resolves.toEqual<WorkflowResult>({
    result: Result.resolved("result"),
    calls: [],
  });
});

const testEvent = event<{ key: string }>("event-type");

test("publish event", async () => {
  const wf = workflow(async () => {
    await testEvent.publishEvents({
      key: "value",
    });

    return "done!";
  });

  const events = [
    {
      name: testEvent.name,
      event: {
        key: "value",
      },
    },
  ];

  await expect(execute(wf, [], undefined)).resolves.toEqual<WorkflowResult>({
    // promise should be instantly resolved
    result: Result.resolved("done!"),
    calls: [publishEventCall(events, 0)],
  });

  await expect(
    execute(wf, [eventsPublished(events, 0)], undefined)
  ).resolves.toEqual<WorkflowResult>({
    // promise should be instantly resolved
    result: Result.resolved("done!"),
    calls: [],
  });
});

test("many events at once", async () => {
  const wf = workflow(async () => {
    for (const _i of [...Array(100).keys()]) {
      await myActivity();
    }

    return "done";
  });

  const executor = new WorkflowExecutor(
    wf,
    [...Array(100).keys()].flatMap((i) => [
      activityScheduled(myActivity.name, i),
      activitySucceeded(undefined, i),
    ])
  );

  await expect(
    executor.start(undefined, context)
  ).resolves.toEqual<WorkflowResult>({
    calls: [],
    result: Result.resolved("done"),
  });
});

describe("continue", () => {
  test("start a workflow with no events and feed it one after", async () => {
    const executor = new WorkflowExecutor(myWorkflow, []);
    await expect(
      executor.start(eventName, context)
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity.name, eventName, 0)],
      result: undefined,
    });

    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).resolves.toEqual<WorkflowResult>({
      calls: [
        activityCall(myActivity0.name, eventName, 1),
        awaitTimerCall(Schedule.time(testTime), 2),
        activityCall(myActivity2.name, eventName, 3),
      ],
      result: undefined,
    });
  });

  test("start a workflow with events and feed it one after", async () => {
    const executor = new WorkflowExecutor(myWorkflow, [
      activityScheduled(myActivity.name, 0),
      activitySucceeded("result", 0),
    ]);
    await expect(
      executor.start(eventName, context)
    ).resolves.toEqual<WorkflowResult>({
      calls: [
        activityCall(myActivity0.name, eventName, 1),
        awaitTimerCall(Schedule.time(testTime), 2),
        activityCall(myActivity2.name, eventName, 3),
      ],
      result: undefined,
    });

    await expect(
      executor.continue([timerCompleted(2), activitySucceeded("result-2", 3)])
    ).resolves.toEqual<WorkflowResult>({
      calls: [],
      result: Result.resolved(["result", [undefined, "result-2"]]),
    });
  });

  test("many iterations", async () => {
    const wf = workflow(async () => {
      for (const _i of [...Array(100).keys()]) {
        await myActivity();
      }

      return "done";
    });

    const executor = new WorkflowExecutor(wf, []);

    await executor.start(undefined, context);

    for (const i of [...Array(99).keys()]) {
      await executor.continue(activitySucceeded(undefined, i));
    }

    await expect(
      executor.continue(activitySucceeded(undefined, 99))
    ).resolves.toEqual<WorkflowResult>({
      calls: [],
      result: Result.resolved("done"),
    });
  });

  test("many iterations at once", async () => {
    const wf = workflow(async () => {
      for (const _i of [...Array(100).keys()]) {
        await myActivity();
      }

      return "done";
    });

    const executor = new WorkflowExecutor(wf, []);

    await executor.start(undefined, context);

    await expect(
      executor.continue(
        [...Array(100).keys()].map((i) => activitySucceeded(undefined, i))
      )
    ).resolves.toEqual<WorkflowResult>({
      calls: [...Array(99).keys()].map((i) =>
        // commands are still emitted because normally the command would precede the events.
        // the first command is emitted during start
        activityCall(myActivity.name, undefined, i + 1)
      ),
      result: Result.resolved("done"),
    });
  });

  test("many iterations at once with expected", async () => {
    const wf = workflow(async () => {
      for (const _i of [...Array(100).keys()]) {
        await myActivity();
      }

      return "done";
    });

    const executor = new WorkflowExecutor(
      wf,
      /**
       * We will provide expected events, but will not consume them all until all of the
       * succeeded events are supplied.
       */
      [...Array(100).keys()].map((i) => activityScheduled(myActivity.name, i))
    );

    await executor.start(undefined, context);

    await expect(
      executor.continue(
        [...Array(100).keys()].map((i) => activitySucceeded(undefined, i))
      )
    ).resolves.toEqual<WorkflowResult>({
      calls: [],
      result: Result.resolved("done"),
    });
  });

  test("throws if previous run not complete", async () => {
    const executor = new WorkflowExecutor(myWorkflow, []);
    const startPromise = executor.start(eventName, context);
    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).rejects.toThrowError(
      "Workflow is already running, await the promise returned by the last start or complete call."
    );
    await expect(startPromise).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity.name, eventName, 0)],
      result: undefined,
    });
    const continuePromise = executor.continue(activitySucceeded("result", 0));
    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).rejects.toThrowError(
      "Workflow is already running, await the promise returned by the last start or complete call."
    );
    await expect(continuePromise).resolves.toEqual<WorkflowResult>({
      calls: [
        activityCall(myActivity0.name, eventName, 1),
        awaitTimerCall(Schedule.time(testTime), 2),
        activityCall(myActivity2.name, eventName, 3),
      ],
      result: undefined,
    });
  });

  test("filters duplicate events", async () => {
    const executor = new WorkflowExecutor(myWorkflow, [
      activityScheduled(myActivity.name, 0),
      activitySucceeded("result", 0),
    ]);
    await executor.start([eventName], context);
    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).resolves.toEqual<WorkflowResult>({
      calls: [],
      result: undefined,
    });
  });
});

describe("running after result", () => {
  test("signal handler works after execution completes", async () => {
    const wf = workflow(async () => {
      onSignal("signal1", () => {
        myActivity();
      });
      return "hello?";
    });

    const executor = new WorkflowExecutor(wf, []);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      calls: [],
      result: Result.resolved("hello?"),
    });

    await expect(
      executor.continue(signalReceived("signal1"))
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity.name, undefined, 1)],
      result: Result.resolved("hello?"),
    });
  });

  test("signal handler accepts after a failure", async () => {
    const wf = workflow(async () => {
      onSignal("signal1", () => {
        myActivity();
      });
      throw Error("AHHH");
    });

    const executor = new WorkflowExecutor(wf, []);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      calls: [],
      result: Result.failed(new Error("AHHH")),
    });

    await expect(
      executor.continue(signalReceived("signal1"))
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity.name, undefined, 1)],
      result: Result.failed(new Error("AHHH")),
    });
  });

  test("async promises after completion", async () => {
    const wf = workflow(async () => {
      onSignal("signal1", async () => {
        let n = 10;
        while (n-- > 0) {
          myActivity();
        }
      });

      (async () => {
        await myActivity0();
      })();

      return "hello?";
    });

    const executor = new WorkflowExecutor(wf, []);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity0.name, undefined, 1)],
      result: Result.resolved("hello?"),
    });

    await expect(
      executor.continue(signalReceived("signal1"))
    ).resolves.toEqual<WorkflowResult>({
      calls: [...Array(10).keys()].map((i) =>
        activityCall(myActivity.name, undefined, 2 + i)
      ),
      result: Result.resolved("hello?"),
    });
  });
});

describe("failures", () => {
  const asyncFuncWf = workflow(async () => {
    await myActivity();

    (async () => {
      await myActivity();
      await myActivity();
      await myActivity();
      await myActivity();
    })();

    throw new Error("AHH");
  });

  const signalWf = workflow(async () => {
    await myActivity();

    onSignal("signal", () => {
      myActivity0();
    });

    throw new Error("AHH");
  });

  test("with events", async () => {
    await expect(
      execute(
        asyncFuncWf,
        [
          activityScheduled(myActivity.name, 0),
          activitySucceeded(undefined, 0),
          activityScheduled(myActivity.name, 1),
          activitySucceeded(undefined, 1),
          activityScheduled(myActivity.name, 2),
          activitySucceeded(undefined, 2),
          activityScheduled(myActivity.name, 3),
          activitySucceeded(undefined, 3),
        ],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity.name, undefined, 4)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with partial async function", async () => {
    await expect(
      execute(
        asyncFuncWf,
        [
          activityScheduled(myActivity.name, 0),
          activitySucceeded(undefined, 0),
        ],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity.name, undefined, 1)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with signal handler", async () => {
    await expect(
      execute(
        signalWf,
        [
          activityScheduled(myActivity.name, 0),
          activitySucceeded(undefined, 0),
          signalReceived("signal"),
        ],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity0.name, undefined, 2)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with signal handler 2", async () => {
    const wf = workflow(async () => {
      await myActivity();

      onSignal("signal", () => {
        myActivity0();
      });

      await expectSignal("signal");

      throw new Error("AHH");
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(myActivity.name, 0),
          activitySucceeded(undefined, 0),
          signalReceived("signal"),
        ],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity0.name, undefined, 3)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("without fail", async () => {
    const wf = workflow(async () => {
      await myActivity();

      onSignal("signal", () => {
        myActivity0();
        throw new Error("AHH");
      });

      await expectSignal("signal");
      myActivity0();
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled(myActivity.name, 0),
          activitySucceeded(undefined, 0),
          signalReceived("signal"),
        ],
        undefined
      )
    ).resolves.toMatchObject<WorkflowResult>({
      calls: [
        activityCall(myActivity0.name, undefined, 3),
        activityCall(myActivity0.name, undefined, 4),
      ],
      result: Result.resolved(undefined),
    });
  });

  test("with lots of events", async () => {
    const wf = workflow(async () => {
      await myActivity();

      let n = 0;
      while (n++ < 10) {
        (async () => {
          await myActivity();
          await myActivity();
        })();
      }

      throw new Error("AHH");
    });

    await expect(
      execute(
        wf,
        [...Array(21).keys()].flatMap((i) => [
          activityScheduled(myActivity.name, i),
          activitySucceeded(undefined, i),
        ]),
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      calls: [],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with continue", async () => {
    const executor = new WorkflowExecutor(signalWf, [
      activityScheduled(myActivity.name, 0),
      activitySucceeded(undefined, 0),
      signalReceived("signal"),
    ]);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity0.name, undefined, 2)],
      result: Result.failed(Error("AHH")),
    });

    await expect(
      executor.continue(signalReceived("signal"))
    ).resolves.toEqual<WorkflowResult>({
      calls: [activityCall(myActivity0.name, undefined, 3)],
      result: Result.failed(Error("AHH")),
    });
  });
});

describe("using then, catch, finally", () => {
  describe("then", () => {
    test("chained result", async () => {
      await expect(
        execute(
          workflow(async () => testMeActivity().then((result) => result + 1)),
          [activityScheduled(testMeActivity.name, 0), activitySucceeded(1, 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved(2),
      });
    });

    test("chained but does not complete", async () => {
      await expect(
        execute(
          workflow(async () => testMeActivity().then((result) => result + 1)),
          [activityScheduled("testme", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: undefined,
      });
    });

    test("chained using immediate resolutions", async () => {
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal").then(() => "hi")
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and emit more", async () => {
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal").then(() => {
              myActivity();
              return "hi";
            })
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [activityCall(myActivity.name, undefined, 1)],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and chain more", async () => {
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal").then(() => myActivity())
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled(myActivity.name, 1),
            activitySucceeded("hi", 1),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved("hi"),
      });
    });

    test("then then then then", async () => {
      const cfw = workflow(async () => {});
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal").then(() => {
              let x = 0;
              return Promise.all([
                myActivity().then(() => {
                  x++;
                  return myActivity0();
                }),
                sendSignal("something", "signal2").then(() => {
                  x++;
                  return myActivity0();
                }),
                cfw().then(() => {
                  x++;
                  return myActivity0();
                }),
                expectSignal("signal2").then(() => {
                  x++;
                  return myActivity0();
                }),
                condition(() => true).then(() => {
                  x++;
                  return myActivity0();
                }),
                condition(() => x >= 5).then(() => myActivity0()),
              ]);
            })
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled(myActivity.name, 1),
            signalSent("something", "signal2", 2),
            workflowScheduled(cfw.name, 3),
            activityScheduled(myActivity0.name, 7), // from signal sent
            activityScheduled(myActivity0.name, 8), // from condition true
            activitySucceeded("hi", 1), // succeed first activity
            activityScheduled(myActivity0.name, 9), // after first act
            workflowSucceeded("something", 3), // succeed child workflow
            activityScheduled(myActivity0.name, 10), // after child workflow
            signalReceived("signal2"), // signal for expect
            activityScheduled(myActivity0.name, 11), // after expect
            activityScheduled(myActivity0.name, 12), // after last condition
            activitySucceeded("b", 7),
            activitySucceeded("e", 8),
            activitySucceeded("a", 9),
            activitySucceeded("c", 10),
            activitySucceeded("d", 11),
            activitySucceeded("f", 12),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved(["a", "b", "c", "d", "e", "f"]),
      });
    });
  });

  describe("catch", () => {
    test("chained result", async () => {
      await expect(
        execute(
          workflow(async () =>
            testMeActivity().catch((result) => (result as Error).name + 1)
          ),
          [activityScheduled("testme", 0), activityFailed(new Error(""), 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved("Error1"),
      });
    });

    test("chained but does not complete", async () => {
      await expect(
        execute(
          workflow(async () =>
            testMeActivity().catch((result) => (result as Error).name + 1)
          ),
          [activityScheduled("testme", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: undefined,
      });
    });

    test("chained using immediate resolutions", async () => {
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal")
              .then(() => {
                throw new Error("");
              })
              .catch(() => "hi")
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and emit more", async () => {
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal")
              .then(() => {
                throw new Error("");
              })
              .catch(() => {
                myActivity();
                return "hi";
              })
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [activityCall(myActivity.name, undefined, 1)],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and chain more", async () => {
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal")
              .then(() => {
                throw Error("");
              })
              .catch(() => myActivity())
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled(myActivity.name, 1),
            activitySucceeded("hi", 1),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved("hi"),
      });
    });

    test("catch catch catch catch", async () => {
      await expect(
        execute(
          workflow(async () =>
            sendSignal("something", "signal")
              .then(() => {
                throw new Error("");
              })
              .catch(() => {
                let x = 0;
                return Promise.all([
                  myActivity().catch(() => {
                    x++;
                    return myActivity0();
                  }),
                  sendSignal("something", "signal2")
                    .then(() => {
                      throw new Error("");
                    })
                    .catch(() => {
                      x++;
                      return myActivity0();
                    }),
                  cwf("workflow1", undefined).catch(() => {
                    x++;
                    return myActivity0();
                  }),
                  expectSignal("signal2", { timeout: time(testTime) }).catch(
                    () => {
                      x++;
                      return myActivity0();
                    }
                  ),
                  condition({ timeout: time(testTime) }, () => false)
                    .then(() => {
                      throw new Error("");
                    })
                    .catch(() => {
                      x++;
                      return myActivity0();
                    }),
                  condition(
                    { timeout: time(testTime) },
                    () => x >= 1000000000000
                  )
                    .then(() => {
                      throw new Error("");
                    })
                    .catch(() => myActivity0()),
                ]);
              })
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled(myActivity.name, 1),
            signalSent("something", "signal2", 2),
            workflowScheduled(cwf.name, 3),
            timerScheduled(4),
            timerScheduled(6),
            timerScheduled(8),
            activityScheduled(myActivity0.name, 10), // from signal sent
            activityFailed("hi", 1), // succeed first activity
            activityScheduled(myActivity0.name, 11), // after first act
            workflowFailed("something", 3), // succeed child workflow
            activityScheduled(myActivity0.name, 12), // after child workflow
            timerCompleted(4),
            activityScheduled(myActivity0.name, 13), // from expect timeout
            timerCompleted(6),
            activityScheduled(myActivity0.name, 14), // from condition false timeout
            timerCompleted(8),
            activityScheduled(myActivity0.name, 15), // from condition 10000000 timeout
            activitySucceeded("b", 10),
            activitySucceeded("a", 11),
            activitySucceeded("c", 12),
            activitySucceeded("d", 13),
            activitySucceeded("e", 14),
            activitySucceeded("f", 15),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved(["a", "b", "c", "d", "e", "f"]),
      });
    });
  });

  describe("finally", () => {
    test("chained result", async () => {
      await expect(
        execute(
          workflow(async () => {
            return Promise.all([
              testMeActivity().finally(() => myActivity()),
              sendSignal("", "signal1").finally(() => myActivity()),
            ]);
          }),
          [
            activityScheduled(testMeActivity.name, 0),
            signalSent("", "signal1", 1),
            activityScheduled(myActivity.name, 2),
            activitySucceeded("something", 0),
            activitySucceeded("something1", 2),
            activityScheduled(myActivity.name, 3),
            activitySucceeded("something2", 3),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        calls: [],
        result: Result.resolved(["something", undefined]),
      });
    });
  });
});
