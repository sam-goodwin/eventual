/* eslint-disable require-await, no-throw-literal */
import {
  duration,
  EventualError,
  HeartbeatTimeout,
  Schedule,
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
  createActivityCall,
  createAwaitTimerCall,
  createConditionCall,
  createExpectSignalCall,
  createPublishEventsCall,
  createRegisterSignalHandlerCall,
  createSendSignalCall,
  createWorkflowCall,
  HistoryEvent,
  Result,
  SignalTargetType,
} from "@eventual/core/internal";
import { WorkflowExecutor, WorkflowResult } from "../src/workflow-executor.js";
import {
  activityFailed,
  activityHeartbeatTimedOut,
  activityScheduled,
  activitySucceeded,
  createPublishEventCommand,
  createScheduledActivityCommand,
  createScheduledWorkflowCommand,
  createSendSignalCommand,
  createStartTimerCommand,
  eventsPublished,
  signalReceived,
  signalSent,
  timerCompleted,
  timerScheduled,
  workflowFailed,
  workflowScheduled,
  workflowSucceeded,
  workflowTimedOut,
} from "./command-util.js";

import "../src/workflow.js";

const event = "hello world";

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

const myWorkflow = workflow(async (event) => {
  try {
    const a = await createActivityCall("my-activity", [event]);

    // dangling - it should still be scheduled
    createActivityCall("my-activity-0", [event]);

    const all = (await Promise.all([
      createAwaitTimerCall(Schedule.time("then")),
      createActivityCall("my-activity-2", [event]),
    ])) as any;
    return [a, all];
  } catch (err) {
    await createActivityCall("handle-error", [err]);
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
  await expect(execute(myWorkflow, [], event)).resolves.toMatchObject(<
    WorkflowResult
  >{
    commands: [createScheduledActivityCommand("my-activity", [event], 0)],
  });
});

test("should continue with result of completed Activity", async () => {
  await expect(
    execute(
      myWorkflow,
      [activityScheduled("my-activity", 0), activitySucceeded("result", 0)],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand("my-activity-0", [event], 1),
      createStartTimerCommand(2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should fail on workflow timeout event", async () => {
  await expect(
    execute(
      myWorkflow,
      [activityScheduled("my-activity", 0), workflowTimedOut()],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Workflow timed out")),
    commands: [],
  });
});

test("should not continue on workflow timeout event", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled("my-activity", 0),
        workflowTimedOut(),
        activitySucceeded("result", 0),
      ],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Workflow timed out")),
    commands: [],
  });
});

test("should catch error of failed Activity", async () => {
  await expect(
    execute(
      myWorkflow,
      [activityScheduled("my-activity", 0), activityFailed("error", 0)],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand(
        "handle-error",
        [new EventualError("error").toJSON()],
        1
      ),
    ],
  });
});

test("should catch error of timing out Activity", async () => {
  const myWorkflow = workflow(async (event) => {
    try {
      const a = await createActivityCall(
        "my-activity",
        [event],
        createAwaitTimerCall(Schedule.time(""))
      );

      return a;
    } catch (err) {
      await createActivityCall("handle-error", [err]);
      return [];
    }
  });

  await expect(
    execute(
      myWorkflow,
      [
        timerScheduled(0),
        timerCompleted(0),
        activityScheduled("my-activity", 1),
      ],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand(
        "handle-error",
        [new Timeout("Activity Timed Out")],
        2
      ),
    ],
  });
});

test("immediately abort activity on invalid timeout", async () => {
  const myWorkflow = workflow((event) => {
    return createActivityCall("my-activity", [event], "not a promise" as any);
  });

  await expect(
    execute(myWorkflow, [activityScheduled("my-activity", 0)], event)
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Activity Timed Out")),
  });
});

test("timeout multiple activities at once", async () => {
  const myWorkflow = workflow(async (event) => {
    const time = createAwaitTimerCall(Schedule.time(""));
    const a = createActivityCall("my-activity", [event], time);
    const b = createActivityCall("my-activity", [event], time);

    return Promise.allSettled([a, b]);
  });

  await expect(
    execute(
      myWorkflow,
      [
        timerScheduled(0),
        activityScheduled("my-activity", 1),
        activityScheduled("my-activity", 2),
        timerCompleted(0),
      ],
      event
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
    commands: [],
  });
});

test("activity times out activity", async () => {
  const myWorkflow = workflow(async (event) => {
    const z = createActivityCall("my-activity", [event]);
    const a = createActivityCall("my-activity", [event], z);
    const b = createActivityCall("my-activity", [event], a);

    return Promise.allSettled([z, a, b]);
  });

  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled("my-activity", 0),
        activityScheduled("my-activity", 1),
        activityScheduled("my-activity", 2),
        activitySucceeded("woo", 0),
      ],
      event
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
    commands: [],
  });
});

test("should return final result", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled("my-activity", 0),
        activitySucceeded("result", 0),
        activityScheduled("my-activity-0", 1),
        timerScheduled(2),
        activityScheduled("my-activity-2", 3),
        activitySucceeded("result-0", 1),
        timerCompleted(2),
        activitySucceeded("result-2", 3),
      ],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved(["result", [undefined, "result-2"]]),
    commands: [],
  });
});

test("should handle missing blocks", async () => {
  await expect(
    execute(myWorkflow, [activitySucceeded("result", 0)], event)
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand("my-activity", [event], 0),
      createScheduledActivityCommand("my-activity-0", [event], 1),
      createStartTimerCommand(2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should handle partial blocks", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled("my-activity", 0),
        activitySucceeded("result", 0),
        activityScheduled("my-activity-0", 1),
      ],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [
      createStartTimerCommand(2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should handle partial blocks with partial completes", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled("my-activity", 0),
        activitySucceeded("result", 0),
        activityScheduled("my-activity-0", 1),
        activitySucceeded("result", 1),
      ],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [
      createStartTimerCommand(2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
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
  describe("heartbeat", () => {
    const wf = workflow(() => {
      return createActivityCall(
        "getPumpedUp",
        [],
        undefined,
        Schedule.duration(100)
      );
    });

    test("timeout from heartbeat seconds", async () => {
      await expect(
        execute(
          wf,
          [
            activityScheduled("getPumpedUp", 0),
            activityHeartbeatTimedOut(0, 101),
          ],
          undefined
        )
      ).resolves.toMatchObject<WorkflowResult>({
        result: Result.failed(
          new HeartbeatTimeout("Activity Heartbeat TimedOut")
        ),
        commands: [],
      });
    });

    test("timeout after complete", async () => {
      await expect(
        execute(
          wf,
          [
            activityScheduled("getPumpedUp", 0),
            activitySucceeded("done", 0),
            activityHeartbeatTimedOut(0, 1000),
          ],
          undefined
        )
      ).resolves.toMatchObject<WorkflowResult>({
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("catch heartbeat timeout", async () => {
      const wf = workflow(async () => {
        try {
          const result = await createActivityCall(
            "getPumpedUp",
            [],
            undefined,
            Schedule.duration(1)
          );
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
            activityScheduled("getPumpedUp", 0),
            activityHeartbeatTimedOut(0, 10),
          ],
          undefined
        )
      ).resolves.toMatchObject<WorkflowResult>({
        result: Result.resolved("Activity Heartbeat TimedOut"),
        commands: [],
      });
    });
  });
});

test("should throw when scheduled does not correspond to call", async () => {
  await expect(
    execute(myWorkflow, [timerScheduled(0)], event)
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "DeterminismError" }),
    commands: [],
  });
});

test("should throw when a completed precedes workflow state", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled("my-activity", 0),
        activityScheduled("result", 1),
        // the workflow does not return a seq: 2, where does this go?
        // note: a completed event can be accepted without a "scheduled" counterpart,
        // but the workflow must resolve the schedule before the complete
        // is applied.
        activitySucceeded("", 2),
      ],
      event
    )
  ).resolves.toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "DeterminismError" }),
    commands: [],
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
    commands: [],
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
    commands: [],
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

    createRegisterSignalHandlerCall("mySignal", (n) => {
      last = n;
      block = false;
    });
    createRegisterSignalHandlerCall("doneSignal", () => {
      done = true;
      block = false;
    });

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!done) {
      createSendSignalCall(
        { type: SignalTargetType.Execution, executionId: input.parentId },
        "mySignal",
        last + 1
      );
      block = true;
      if (
        !(await createConditionCall(
          () => !block,
          createAwaitTimerCall(Schedule.duration(10, "seconds"))
        ))
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
    commands: [],
  });
});

test("dangling promise failure", async () => {
  const wf = workflow(async () => {
    createActivityCall("I will fail", undefined);

    await createConditionCall(() => false);

    return "done";
  });

  const executor = new WorkflowExecutor(wf, [
    activityScheduled("I will fail", 0),
  ]);

  await executor.start(undefined, context);

  await expect(
    executor.continue([activityFailed(new Error("AHH"), 0)])
  ).resolves.toMatchObject<WorkflowResult>({
    result: undefined,
    commands: [],
  });
});

test.skip("dangling promise failure with then", async () => {
  const wf = workflow(async () => {
    createActivityCall("I will fail", undefined).then(() => {
      console.log("hi");
    });

    await createConditionCall(() => false);

    return "done";
  });

  const executor = new WorkflowExecutor(wf, [
    activityScheduled("I will fail", 0),
  ]);

  await executor.start(undefined, context);

  await expect(
    executor.continue([activityFailed(new Error("AHH"), 0)])
  ).resolves.toMatchObject<WorkflowResult>({
    result: undefined,
    commands: [],
  });
});

test("dangling promise success", async () => {
  const wf = workflow(async () => {
    createActivityCall("I will fail", undefined);

    await createConditionCall(() => false);

    return "done";
  });

  const executor = new WorkflowExecutor(wf, [
    activityScheduled("I will fail", 0),
  ]);

  await executor.start(undefined, context);

  await expect(
    executor.continue([activitySucceeded("ahhh", 0)])
  ).resolves.toMatchObject<WorkflowResult>({
    result: undefined,
    commands: [],
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
    commands: [],
  });
});

test("should wait if partial results", async () => {
  await expect(
    execute(
      myWorkflow,
      [
        activityScheduled("my-activity", 0),
        activitySucceeded("result", 0),
        activityScheduled("my-activity-0", 1),
        timerScheduled(2),
        activityScheduled("my-activity-2", 3),
        activitySucceeded("result-0", 1),
        timerCompleted(2),
      ],
      event
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [],
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
    commands: [],
  });
});

test("should schedule duration", async () => {
  const wf = workflow(async () => {
    await createAwaitTimerCall(Schedule.duration(10));
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    commands: [createStartTimerCommand(Schedule.duration(10), 0)],
  });
});

test("should not re-schedule duration", async () => {
  const wf = workflow(async () => {
    await duration(10);
  });

  await expect(
    execute(wf, [timerScheduled(0)], undefined)
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [],
  });
});

test("should complete duration", async () => {
  const wf = workflow(async () => {
    await createAwaitTimerCall(Schedule.duration(10));
    return "done";
  });

  await expect(
    execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved("done"),
    commands: [],
  });
});

test("should schedule time", async () => {
  const now = new Date();

  const wf = workflow(async () => {
    await createAwaitTimerCall(Schedule.time(now));
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    commands: [createStartTimerCommand(Schedule.time(now.toISOString()), 0)],
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
    commands: [],
  });
});

test("should complete time", async () => {
  const now = new Date();

  const wf = workflow(async () => {
    await createAwaitTimerCall(Schedule.time(now));
    return "done";
  });

  await expect(
    execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
  ).resolves.toMatchObject(<WorkflowResult>{
    result: Result.resolved("done"),
    commands: [],
  });
});

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
      await createAwaitTimerCall(Schedule.time("then"));
      trapDown = true;
    }

    async function waitForJump() {
      await createActivityCall("jump", []);
      jump = true;
    }

    startTrap();
    // the player can jump now
    waitForJump();

    await createActivityCall("run", []);

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
      commands: [
        createStartTimerCommand(0),
        createScheduledActivityCommand("jump", [], 1),
        createScheduledActivityCommand("run", [], 2),
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
      commands: [],
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
      commands: [],
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
      commands: [],
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
      commands: [],
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
      commands: [],
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
      commands: [],
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
      commands: [],
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
      commands: [],
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
    commands: [],
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
      commands: [],
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
      commands: [],
    });
  });

  test("should support already awaited or awaited eventuals", async () => {
    const wf = workflow(async () => {
      return Promise.all([
        await createActivityCall("process-item", []),
        await createActivityCall("process-item", []),
      ]);
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
          activitySucceeded(1, 0),
          activitySucceeded(1, 1),
        ],
        undefined
      )
    ).resolves.toMatchObject(<WorkflowResult>{
      result: Result.resolved([1, 1]),
      commands: [],
    });
  });

  test("should support Promise.all of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.all(
        items.map(async (item) => {
          return await createActivityCall("process-item", [item]);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      commands: [
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
        createActivityCall("before", ["before"]),
        ...items.map(async (item) => {
          await createActivityCall("inside", [item]);
        }),
        createActivityCall("after", ["after"]),
      ]);
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      commands: [
        createScheduledActivityCommand("before", ["before"], 0),
        createScheduledActivityCommand("inside", ["a"], 1),
        createScheduledActivityCommand("inside", ["b"], 2),
        createScheduledActivityCommand("after", ["after"], 3),
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
      commands: [],
    });
  });

  test("should support Promise.any of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.any(
        items.map(async (item) => {
          return await createActivityCall("process-item", [item]);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      commands: [
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          return await createActivityCall("process-item", [item]);
        })
      );
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          return await createActivityCall("process-item", [item]);
        })
      );
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
      commands: [],
    });
  });

  test("should support Promise.race of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.race(
        items.map(async (item) => {
          return await createActivityCall("process-item", [item]);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject(<
      WorkflowResult
    >{
      commands: [
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          return await createActivityCall("process-item", [item]);
        })
      );
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
      commands: [],
    });
  });

  test("should support Promise.allSettled of function calls", async () => {
    const wf = workflow(async (items: string[]) => {
      return Promise.allSettled(
        items.map(async (item) => {
          return await createActivityCall("process-item", [item]);
        })
      );
    });

    await expect(execute(wf, [], ["a", "b"])).resolves.toMatchObject<
      WorkflowResult<PromiseSettledResult<string>[]>
    >({
      commands: [
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
      commands: [],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
      commands: [],
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("process-item", 0),
          activityScheduled("process-item", 1),
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
      commands: [],
    });
  });
});

test("try-catch-finally with await in catch", async () => {
  const wf = workflow(async () => {
    try {
      throw new Error("error");
    } catch {
      await createActivityCall("catch", []);
    } finally {
      await createActivityCall("finally", []);
    }
  });
  await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
    WorkflowResult
  >{
    commands: [createScheduledActivityCommand("catch", [], 0)],
  });
  await expect(
    execute(
      wf,
      [activityScheduled("catch", 0), activitySucceeded(undefined, 0)],
      undefined
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [createScheduledActivityCommand("finally", [], 1)],
  });
});

test("try-catch-finally with dangling promise in catch", async () => {
  await expect(
    execute(
      workflow(async () => {
        try {
          throw new Error("error");
        } catch {
          createActivityCall("catch", []);
        } finally {
          await createActivityCall("finally", []);
        }
      }),
      [],
      undefined
    )
  ).resolves.toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand("catch", [], 0),
      createScheduledActivityCommand("finally", [], 1),
    ],
  });
});

test("throw error within nested function", async () => {
  const wf = workflow(async (items: string[]) => {
    try {
      await Promise.all(
        items.map(async (item) => {
          const result = await createActivityCall("inside", [item]);

          if (result === "bad") {
            throw new Error("bad");
          }
        })
      );
    } catch {
      await createActivityCall("catch", []);
      return "returned in catch"; // this should be trumped by the finally
    } finally {
      await createActivityCall("finally", []);
      // eslint-disable-next-line no-unsafe-finally
      return "returned in finally";
    }
  });
  await expect(execute(wf, [], ["good", "bad"])).resolves.toMatchObject(<
    WorkflowResult
  >{
    commands: [
      createScheduledActivityCommand("inside", ["good"], 0),
      createScheduledActivityCommand("inside", ["bad"], 1),
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
    commands: [createScheduledActivityCommand("catch", [], 2)],
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
    commands: [createScheduledActivityCommand("finally", [], 3)],
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
    commands: [],
  });
});

test("properly evaluate await of sub-programs", async () => {
  async function sub() {
    const item = await Promise.all([
      createActivityCall("a", []),
      createActivityCall("b", []),
    ]);

    return item;
  }

  const wf = workflow(async () => {
    return await sub();
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject({
    commands: [
      //
      createScheduledActivityCommand("a", [], 0),
      createScheduledActivityCommand("b", [], 1),
    ],
  });

  await expect(
    execute(
      wf,
      [
        activityScheduled("a", 0),
        activityScheduled("b", 1),
        activitySucceeded("a", 0),
        activitySucceeded("b", 1),
      ],
      undefined
    )
  ).resolves.toMatchObject({
    result: Result.resolved(["a", "b"]),
    commands: [],
  });
});

test("properly evaluate await of Promise.all", async () => {
  const wf = workflow(async () => {
    const item = await Promise.all([
      createActivityCall("a", []),
      createActivityCall("b", []),
    ]);

    return item;
  });

  await expect(execute(wf, [], undefined)).resolves.toMatchObject({
    commands: [
      //
      createScheduledActivityCommand("a", [], 0),
      createScheduledActivityCommand("b", [], 1),
    ],
  });

  await expect(
    execute(
      wf,
      [
        activityScheduled("a", 0),
        activityScheduled("b", 1),
        activitySucceeded("a", 0),
        activitySucceeded("b", 1),
      ],
      undefined
    )
  ).resolves.toMatchObject({
    result: Result.resolved(["a", "b"]),
    commands: [],
  });
});

test("generator function returns an ActivityCall", async () => {
  const wf = workflow(async () => {
    return await sub();
  });

  async function sub() {
    return createActivityCall("call-a", []);
  }

  await expect(execute(wf, [], undefined)).resolves.toMatchObject({
    commands: [createScheduledActivityCommand("call-a", [], 0)],
  });
  await expect(
    execute(
      wf,
      [activityScheduled("call-a", 0), activitySucceeded("result", 0)],
      undefined
    )
  ).resolves.toMatchObject({
    result: Result.resolved("result"),
    commands: [],
  });
});

test("workflow calling other workflow", async () => {
  const wf1 = workflow(async () => {
    await createActivityCall("call-a", []);
  });
  const wf2 = workflow(async () => {
    const result = (await createWorkflowCall(wf1.name)) as any;
    await createActivityCall("call-b", []);
    return result;
  });

  await expect(execute(wf2, [], undefined)).resolves.toMatchObject({
    commands: [createScheduledWorkflowCommand(wf1.name, undefined, 0)],
  });

  await expect(
    execute(wf2, [workflowScheduled(wf1.name, 0)], undefined)
  ).resolves.toMatchObject({
    commands: [],
  });

  await expect(
    execute(
      wf2,
      [workflowScheduled(wf1.name, 0), workflowSucceeded("result", 0)],
      undefined
    )
  ).resolves.toMatchObject({
    commands: [createScheduledActivityCommand("call-b", [], 1)],
  });

  await expect(
    execute(
      wf2,
      [
        workflowScheduled(wf1.name, 0),
        workflowSucceeded("result", 0),
        activityScheduled("call-b", 1),
      ],
      undefined
    )
  ).resolves.toMatchObject({
    commands: [],
  });

  await expect(
    execute(
      wf2,
      [
        workflowScheduled(wf1.name, 0),
        workflowSucceeded("result", 0),
        activityScheduled("call-b", 1),
        activitySucceeded(undefined, 1),
      ],
      undefined
    )
  ).resolves.toMatchObject({
    result: Result.resolved("result"),
    commands: [],
  });

  await expect(
    execute(
      wf2,
      [workflowScheduled(wf1.name, 0), workflowFailed("error", 0)],
      undefined
    )
  ).resolves.toMatchObject({
    result: Result.failed(new EventualError("error").toJSON()),
    commands: [],
  });
});

describe("signals", () => {
  describe("expect signal", () => {
    const wf = workflow(async () => {
      const result = await createExpectSignalCall(
        "MySignal",
        createAwaitTimerCall(Schedule.duration(100 * 1000, "seconds"))
      );

      return result ?? "done";
    });

    test("start expect signal", async () => {
      await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
        WorkflowResult
      >{
        commands: [createStartTimerCommand(Schedule.duration(100 * 1000), 0)],
      });
    });

    test("no signal", async () => {
      await expect(
        execute(wf, [timerScheduled(0)], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        commands: [],
      });
    });

    test("match signal", async () => {
      await expect(
        execute(wf, [timerScheduled(0), signalReceived("MySignal")], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
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
        commands: [],
      });
    });

    test("timed out", async () => {
      await expect(
        execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.failed(new Timeout("Expect Signal Timed Out")),
        commands: [],
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
        commands: [],
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
        commands: [],
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
        commands: [],
      });
    });

    test("multiple of the same signal", async () => {
      const wf = workflow(async () => {
        const wait1 = createExpectSignalCall(
          "MySignal",
          createAwaitTimerCall(Schedule.duration(100 * 1000, "seconds"))
        );
        const wait2 = createExpectSignalCall(
          "MySignal",
          createAwaitTimerCall(Schedule.duration(100 * 1000, "seconds"))
        );

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
        commands: [],
      });
    });

    test("expect then timeout", async () => {
      const wf = workflow(async () => {
        await createExpectSignalCall(
          "MySignal",
          createAwaitTimerCall(Schedule.duration(100 * 1000, "seconds"))
        );
        await createExpectSignalCall(
          "MySignal",
          createAwaitTimerCall(Schedule.duration(100 * 1000, "seconds"))
        );
      });

      await expect(
        execute(wf, [timerScheduled(0), timerCompleted(0)], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.failed({ name: "Timeout" }),
        commands: [],
      });
    });

    test("expect random signal then timeout", async () => {
      const wf = workflow(async () => {
        await createExpectSignalCall(
          "MySignal",
          createAwaitTimerCall(Schedule.duration(100 * 1000, "seconds"))
        );
        await createExpectSignalCall(
          "MySignal",
          createAwaitTimerCall(Schedule.duration(100 * 1000, "seconds"))
        );
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
        commands: [],
      });
    });
  });

  describe("signal handler", () => {
    const wf = workflow(async () => {
      let mySignalHappened = 0;
      let myOtherSignalHappened = 0;
      let myOtherSignalCompleted = 0;
      const mySignalHandler = createRegisterSignalHandlerCall(
        "MySignal",
        // the transformer will turn this closure into a generator wrapped in chain
        function () {
          mySignalHappened++;
        }
      );
      const myOtherSignalHandler = createRegisterSignalHandlerCall(
        "MyOtherSignal",
        async function (payload) {
          myOtherSignalHappened++;
          await createActivityCall("act1", [payload]);
          myOtherSignalCompleted++;
        }
      );

      await createAwaitTimerCall(Schedule.time("then"));

      mySignalHandler.dispose();
      myOtherSignalHandler.dispose();

      await createAwaitTimerCall(Schedule.time("then"));

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
        commands: [createStartTimerCommand(2)],
      });
    });

    test("send signal, do not wake up", async () => {
      await expect(
        execute(wf, [signalReceived("MySignal")], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        commands: [createStartTimerCommand(2)],
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
        commands: [],
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
        commands: [],
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
        commands: [],
      });
    });

    test("send other signal, do not complete", async () => {
      await expect(
        execute(wf, [signalReceived("MyOtherSignal", "hi")], undefined)
      ).resolves.toMatchObject(<WorkflowResult>{
        commands: [
          createStartTimerCommand(2),
          createScheduledActivityCommand("act1", ["hi"], 3),
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
        commands: [
          createStartTimerCommand(2),
          createScheduledActivityCommand("act1", ["hi"], 3),
          createScheduledActivityCommand("act1", ["hi2"], 4),
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
            activityScheduled("act1", 3),
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
        commands: [],
      });
    });

    test("send other signal, wake timer, complete activity", async () => {
      await expect(
        execute(
          wf,
          [
            signalReceived("MyOtherSignal", "hi"),
            timerScheduled(2),
            activityScheduled("act1", 3),
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
        commands: [],
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
            activityScheduled("act1", 3),
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
        commands: [],
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
        commands: [],
      });
    });
  });

  describe("send signal", () => {
    const mySignal = signal("MySignal");
    const wf = workflow(async () => {
      createSendSignalCall(
        { type: SignalTargetType.Execution, executionId: "someExecution/" },
        mySignal.id
      );

      const childWorkflow = createWorkflowCall("childWorkflow");

      childWorkflow.sendSignal(mySignal);

      return await childWorkflow;
    });

    test("start", async () => {
      await expect(execute(wf, [], undefined)).resolves.toMatchObject(<
        WorkflowResult
      >{
        commands: [
          createSendSignalCommand(
            {
              type: SignalTargetType.Execution,
              executionId: "someExecution/",
            },
            "MySignal",
            0
          ),
          createScheduledWorkflowCommand("childWorkflow", undefined, 1),
          createSendSignalCommand(
            {
              type: SignalTargetType.ChildExecution,
              workflowName: "childWorkflow",
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
        commands: [
          createScheduledWorkflowCommand("childWorkflow", undefined, 1),
          createSendSignalCommand(
            {
              type: SignalTargetType.ChildExecution,
              workflowName: "childWorkflow",
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
            workflowScheduled("childWorkflow", 1),
            signalSent("someExecution/", "MySignal", 2),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        commands: [],
      });
    });

    test("complete", async () => {
      await expect(
        execute(
          wf,
          [
            signalSent("someExec", "MySignal", 0),
            workflowScheduled("childWorkflow", 1),
            signalSent("someExecution/", "MySignal", 2),
            workflowSucceeded("done", 1),
          ],
          undefined
        )
      ).resolves.toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("sendSignal then", async () => {
      const wf = workflow(async () => {
        console.log("before signal");
        return createSendSignalCall(
          { type: SignalTargetType.Execution, executionId: "someExecution/" },
          mySignal.id
        ).then(async () => {
          console.log("after signal");

          const childWorkflow = createWorkflowCall("childWorkflow");

          await childWorkflow.sendSignal(mySignal);

          return await childWorkflow;
        });
      });

      await expect(
        execute(
          wf,
          [
            signalSent("someExec", "MySignal", 0),
            workflowScheduled("childWorkflow", 1),
            signalSent("someExecution/", "MySignal", 2),
            workflowSucceeded("done", 1),
          ],
          undefined
        )
      ).resolves.toEqual(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("awaited sendSignal does nothing 2", async () => {
      const wf = workflow(async () => {
        console.log("before signal");
        await createSendSignalCall(
          { type: SignalTargetType.Execution, executionId: "someExecution/" },
          mySignal.id
        );

        console.log("after signal");

        const childWorkflow = createWorkflowCall("childWorkflow");

        await childWorkflow.sendSignal(mySignal);

        return await childWorkflow;
      });

      await expect(
        execute(
          wf,
          [
            signalSent("someExec", "MySignal", 0),
            workflowScheduled("childWorkflow", 1),
            signalSent("someExecution/", "MySignal", 2),
            workflowSucceeded("done", 1),
          ],
          undefined
        )
      ).resolves.toEqual(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });
  });
});

describe("condition", () => {
  test("already true condition does not emit events", async () => {
    const wf = workflow(async () => {
      await createConditionCall(() => true);
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      commands: [],
    });
  });

  test("false condition emits events", async () => {
    const wf = workflow(async () => {
      await createConditionCall(() => false);
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      commands: [],
    });
  });

  test("false condition emits events with timeout", async () => {
    const wf = workflow(async () => {
      await createConditionCall(
        () => false,
        createAwaitTimerCall(Schedule.duration(100, "seconds"))
      );
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      commands: [createStartTimerCommand(Schedule.duration(100), 0)],
    });
  });

  test("false condition does not re-emit", async () => {
    const wf = workflow(async () => {
      await createConditionCall(
        () => false,
        createAwaitTimerCall(Schedule.duration(100, "seconds"))
      );
    });

    await expect(
      execute(wf, [timerScheduled(0)], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      commands: [],
    });
  });

  const signalConditionFlow = workflow(async () => {
    let yes = false;
    createRegisterSignalHandlerCall("Yes", () => {
      yes = true;
    });
    if (
      !(await createConditionCall(
        () => yes,
        createAwaitTimerCall(Schedule.duration(100, "seconds"))
      ))
    ) {
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
      commands: [],
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
      commands: [],
    });
  });

  test("never trigger when state changes", async () => {
    const signalConditionOnAndOffFlow = workflow(async () => {
      let yes = false;
      createRegisterSignalHandlerCall("Yes", () => {
        yes = true;
      });
      createRegisterSignalHandlerCall("Yes", () => {
        yes = false;
      });
      await createConditionCall(() => yes);
      return "done";
    });

    await expect(
      execute(signalConditionOnAndOffFlow, [signalReceived("Yes")], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      commands: [],
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
      commands: [],
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
      commands: [],
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
      commands: [],
    });
  });

  test("condition as simple generator", async () => {
    const wf = workflow(async () => {
      await createConditionCall(() => false);
      return "done";
    });

    await expect(
      execute(wf, [], undefined)
    ).resolves.toMatchObject<WorkflowResult>({
      commands: [],
    });
  });
});

test("nestedChains", async () => {
  const wf = workflow(async () => {
    const funcs = {
      a: async () => {
        await createAwaitTimerCall(Schedule.time("then"));
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
    commands: [createStartTimerCommand(0)],
  });
});

test("mixing closure types", async () => {
  const workflow4 = workflow(async () => {
    const greetings = Promise.all(
      ["sam", "chris", "sam"].map((name) => createActivityCall("hello", [name]))
    );
    const greetings2 = Promise.all(
      ["sam", "chris", "sam"].map(async (name) => {
        const greeting = await createActivityCall<number>("hello", [name]);
        return greeting * 2;
      })
    );
    const greetings3 = Promise.all([
      createActivityCall("hello", ["sam"]),
      createActivityCall("hello", ["chris"]),
      createActivityCall("hello", ["sam"]),
    ]);
    return Promise.all([greetings, greetings2, greetings3]);
  });

  await expect(
    execute(workflow4, [], undefined)
  ).resolves.toEqual<WorkflowResult>({
    commands: [
      createScheduledActivityCommand("hello", ["sam"], 0),
      createScheduledActivityCommand("hello", ["chris"], 1),
      createScheduledActivityCommand("hello", ["sam"], 2),
      createScheduledActivityCommand("hello", ["sam"], 3),
      createScheduledActivityCommand("hello", ["chris"], 4),
      createScheduledActivityCommand("hello", ["sam"], 5),
      createScheduledActivityCommand("hello", ["sam"], 6),
      createScheduledActivityCommand("hello", ["chris"], 7),
      createScheduledActivityCommand("hello", ["sam"], 8),
    ],
  });

  await expect(
    execute(
      workflow4,
      [
        activityScheduled("hello", 0),
        activityScheduled("hello", 1),
        activityScheduled("hello", 2),
        activityScheduled("hello", 3),
        activityScheduled("hello", 4),
        activityScheduled("hello", 5),
        activityScheduled("hello", 6),
        activityScheduled("hello", 7),
        activityScheduled("hello", 8),
      ],
      undefined
    )
  ).resolves.toEqual<WorkflowResult>({
    commands: [],
  });

  await expect(
    execute(
      workflow4,
      [
        activityScheduled("hello", 0),
        activityScheduled("hello", 1),
        activityScheduled("hello", 2),
        activityScheduled("hello", 3),
        activityScheduled("hello", 4),
        activityScheduled("hello", 5),
        activityScheduled("hello", 6),
        activityScheduled("hello", 7),
        activityScheduled("hello", 8),
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
    commands: [],
  });
});

test("workflow with synchronous function", async () => {
  const workflow4 = workflow(function () {
    return createActivityCall("hi", []);
  });

  await expect(
    execute(workflow4, [], undefined)
  ).resolves.toEqual<WorkflowResult>({
    commands: [createScheduledActivityCommand("hi", [], 0)],
  });

  await expect(
    execute(
      workflow4,
      [activityScheduled("hi", 0), activitySucceeded("result", 0)],
      undefined
    )
  ).resolves.toEqual<WorkflowResult>({
    result: Result.resolved("result"),
    commands: [],
  });
});

test("publish event", async () => {
  const wf = workflow(async () => {
    await createPublishEventsCall([
      {
        name: "event-type",
        event: {
          key: "value",
        },
      },
    ]);

    return "done!";
  });

  const events = [
    {
      name: "event-type",
      event: {
        key: "value",
      },
    },
  ];

  await expect(execute(wf, [], undefined)).resolves.toEqual<WorkflowResult>({
    // promise should be instantly resolved
    result: Result.resolved("done!"),
    commands: [createPublishEventCommand(events, 0)],
  });

  await expect(
    execute(wf, [eventsPublished(events, 0)], undefined)
  ).resolves.toEqual<WorkflowResult>({
    // promise should be instantly resolved
    result: Result.resolved("done!"),
    commands: [],
  });
});

test("many events at once", async () => {
  const wf = workflow(async () => {
    for (const i of [...Array(100).keys()]) {
      await createActivityCall("myAct", i);
    }

    return "done";
  });

  const executor = new WorkflowExecutor(
    wf,
    [...Array(100).keys()].flatMap((i) => [
      activityScheduled("myAct", i),
      activitySucceeded(undefined, i),
    ])
  );

  await expect(
    executor.start(undefined, context)
  ).resolves.toEqual<WorkflowResult>({
    commands: [],
    result: Result.resolved("done"),
  });
});

describe("continue", () => {
  test("start a workflow with no events and feed it one after", async () => {
    const executor = new WorkflowExecutor(myWorkflow, []);
    await expect(
      executor.start(event, context)
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("my-activity", [event], 0)],
      result: undefined,
    });

    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).resolves.toEqual<WorkflowResult>({
      commands: [
        createScheduledActivityCommand("my-activity-0", [event], 1),
        createStartTimerCommand(2),
        createScheduledActivityCommand("my-activity-2", [event], 3),
      ],
      result: undefined,
    });
  });

  test("start a workflow with events and feed it one after", async () => {
    const executor = new WorkflowExecutor(myWorkflow, [
      activityScheduled("my-activity", 0),
      activitySucceeded("result", 0),
    ]);
    await expect(
      executor.start(event, context)
    ).resolves.toEqual<WorkflowResult>({
      commands: [
        createScheduledActivityCommand("my-activity-0", [event], 1),
        createStartTimerCommand(2),
        createScheduledActivityCommand("my-activity-2", [event], 3),
      ],
      result: undefined,
    });

    await expect(
      executor.continue([timerCompleted(2), activitySucceeded("result-2", 3)])
    ).resolves.toEqual<WorkflowResult>({
      commands: [],
      result: Result.resolved(["result", [undefined, "result-2"]]),
    });
  });

  test("many iterations", async () => {
    const wf = workflow(async () => {
      for (const i of [...Array(100).keys()]) {
        await createActivityCall("myAct", i);
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
      commands: [],
      result: Result.resolved("done"),
    });
  });

  test("many iterations at once", async () => {
    const wf = workflow(async () => {
      for (const i of [...Array(100).keys()]) {
        await createActivityCall("myAct", i);
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
      commands: [...Array(99).keys()].map((i) =>
        // commands are still emitted because normally the command would precede the events.
        // the first command is emitted during start
        createScheduledActivityCommand("myAct", i + 1, i + 1)
      ),
      result: Result.resolved("done"),
    });
  });

  test("many iterations at once with expected", async () => {
    const wf = workflow(async () => {
      for (const i of [...Array(100).keys()]) {
        await createActivityCall("myAct", i);
      }

      return "done";
    });

    const executor = new WorkflowExecutor(
      wf,
      /**
       * We will provide expected events, but will not consume them all until all of the
       * succeeded events are supplied.
       */
      [...Array(100).keys()].map((i) => activityScheduled("myAct", i))
    );

    await executor.start(undefined, context);

    await expect(
      executor.continue(
        [...Array(100).keys()].map((i) => activitySucceeded(undefined, i))
      )
    ).resolves.toEqual<WorkflowResult>({
      commands: [],
      result: Result.resolved("done"),
    });
  });

  test("throws if previous run not complete", async () => {
    const executor = new WorkflowExecutor(myWorkflow, []);
    const startPromise = executor.start(event, context);
    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).rejects.toThrowError(
      "Workflow is already running, await the promise returned by the last start or complete call."
    );
    await expect(startPromise).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("my-activity", [event], 0)],
      result: undefined,
    });
    const continuePromise = executor.continue(activitySucceeded("result", 0));
    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).rejects.toThrowError(
      "Workflow is already running, await the promise returned by the last start or complete call."
    );
    await expect(continuePromise).resolves.toEqual<WorkflowResult>({
      commands: [
        createScheduledActivityCommand("my-activity-0", [event], 1),
        createStartTimerCommand(2),
        createScheduledActivityCommand("my-activity-2", [event], 3),
      ],
      result: undefined,
    });
  });

  test("filters duplicate events", async () => {
    const executor = new WorkflowExecutor(myWorkflow, [
      activityScheduled("my-activity", 0),
      activitySucceeded("result", 0),
    ]);
    await executor.start([event], context);
    await expect(
      executor.continue(activitySucceeded("result", 0))
    ).resolves.toEqual<WorkflowResult>({
      commands: [],
      result: undefined,
    });
  });
});

describe("running after result", () => {
  test("signal handler works after execution completes", async () => {
    const wf = workflow(async () => {
      createRegisterSignalHandlerCall("signal1", () => {
        createActivityCall("on signal", 1);
      });
      return "hello?";
    });

    const executor = new WorkflowExecutor(wf, []);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      commands: [],
      result: Result.resolved("hello?"),
    });

    await expect(
      executor.continue(signalReceived("signal1"))
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("on signal", 1, 1)],
      result: Result.resolved("hello?"),
    });
  });

  test("signal handler accepts after a failure", async () => {
    const wf = workflow(async () => {
      createRegisterSignalHandlerCall("signal1", () => {
        createActivityCall("on signal", 1);
      });
      throw Error("AHHH");
    });

    const executor = new WorkflowExecutor(wf, []);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      commands: [],
      result: Result.failed(new Error("AHHH")),
    });

    await expect(
      executor.continue(signalReceived("signal1"))
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("on signal", 1, 1)],
      result: Result.failed(new Error("AHHH")),
    });
  });

  test("async promises after completion", async () => {
    const wf = workflow(async () => {
      createRegisterSignalHandlerCall("signal1", async () => {
        let n = 10;
        while (n-- > 0) {
          createActivityCall("on signal", 1);
        }
      });

      (async () => {
        await createActivityCall("in the async", undefined);
      })();

      return "hello?";
    });

    const executor = new WorkflowExecutor(wf, []);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("in the async", undefined, 1)],
      result: Result.resolved("hello?"),
    });

    await expect(
      executor.continue(signalReceived("signal1"))
    ).resolves.toEqual<WorkflowResult>({
      commands: [...Array(10).keys()].map((i) =>
        createScheduledActivityCommand("on signal", 1, 2 + i)
      ),
      result: Result.resolved("hello?"),
    });
  });
});

describe("failures", () => {
  const asyncFuncWf = workflow(async () => {
    await createActivityCall("hello", undefined);

    (async () => {
      await createActivityCall("hello", undefined);
      await createActivityCall("hello", undefined);
      await createActivityCall("hello", undefined);
      await createActivityCall("hello", undefined);
    })();

    throw new Error("AHH");
  });

  const signalWf = workflow(async () => {
    await createActivityCall("hello", undefined);

    createRegisterSignalHandlerCall("signal", () => {
      createActivityCall("signalAct", undefined);
    });

    throw new Error("AHH");
  });

  test("with events", async () => {
    await expect(
      execute(
        asyncFuncWf,
        [
          activityScheduled("hello", 0),
          activitySucceeded(undefined, 0),
          activityScheduled("hello", 1),
          activitySucceeded(undefined, 1),
          activityScheduled("hello", 2),
          activitySucceeded(undefined, 2),
          activityScheduled("hello", 3),
          activitySucceeded(undefined, 3),
        ],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("hello", undefined, 4)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with partial async function", async () => {
    await expect(
      execute(
        asyncFuncWf,
        [activityScheduled("hello", 0), activitySucceeded(undefined, 0)],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("hello", undefined, 1)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with signal handler", async () => {
    await expect(
      execute(
        signalWf,
        [
          activityScheduled("hello", 0),
          activitySucceeded(undefined, 0),
          signalReceived("signal"),
        ],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("signalAct", undefined, 2)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with signal handler 2", async () => {
    const wf = workflow(async () => {
      await createActivityCall("hello", undefined);

      createRegisterSignalHandlerCall("signal", () => {
        createActivityCall("signalAct", undefined);
      });

      await createExpectSignalCall("signal");

      throw new Error("AHH");
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("hello", 0),
          activitySucceeded(undefined, 0),
          signalReceived("signal"),
        ],
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("signalAct", undefined, 3)],
      result: Result.failed(Error("AHH")),
    });
  });

  test("without fail", async () => {
    const wf = workflow(async () => {
      await createActivityCall("hello", undefined);

      createRegisterSignalHandlerCall("signal", () => {
        createActivityCall("signalAct", undefined);
        throw new Error("AHH");
      });

      await createExpectSignalCall("signal");
      createActivityCall("signalAct", undefined);
    });

    await expect(
      execute(
        wf,
        [
          activityScheduled("hello", 0),
          activitySucceeded(undefined, 0),
          signalReceived("signal"),
        ],
        undefined
      )
    ).resolves.toMatchObject<WorkflowResult>({
      commands: [
        createScheduledActivityCommand("signalAct", undefined, 3),
        createScheduledActivityCommand("signalAct", undefined, 4),
      ],
      result: Result.resolved(undefined),
    });
  });

  test("with lots of events", async () => {
    const wf = workflow(async () => {
      await createActivityCall("hello", undefined);

      let n = 0;
      while (n++ < 10) {
        (async () => {
          await createActivityCall("hello", undefined);
          await createActivityCall("hello", undefined);
        })();
      }

      throw new Error("AHH");
    });

    await expect(
      execute(
        wf,
        [...Array(21).keys()].flatMap((i) => [
          activityScheduled("hello", i),
          activitySucceeded(undefined, i),
        ]),
        undefined
      )
    ).resolves.toEqual<WorkflowResult>({
      commands: [],
      result: Result.failed(Error("AHH")),
    });
  });

  test("with continue", async () => {
    const executor = new WorkflowExecutor(signalWf, [
      activityScheduled("hello", 0),
      activitySucceeded(undefined, 0),
      signalReceived("signal"),
    ]);

    await expect(
      executor.start(undefined, context)
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("signalAct", undefined, 2)],
      result: Result.failed(Error("AHH")),
    });

    await expect(
      executor.continue(signalReceived("signal"))
    ).resolves.toEqual<WorkflowResult>({
      commands: [createScheduledActivityCommand("signalAct", undefined, 3)],
      result: Result.failed(Error("AHH")),
    });
  });
});

describe("using then, catch, finally", () => {
  describe("then", () => {
    test("chained result", async () => {
      await expect(
        execute(
          workflow(async () =>
            createActivityCall<number>("testme", undefined).then(
              (result) => result + 1
            )
          ),
          [activityScheduled("testme", 0), activitySucceeded(1, 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: Result.resolved(2),
      });
    });

    test("chained but does not complete", async () => {
      await expect(
        execute(
          workflow(async () =>
            createActivityCall<number>("testme", undefined).then(
              (result) => result + 1
            )
          ),
          [activityScheduled("testme", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: undefined,
      });
    });

    test("chained using immediate resolutions", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            ).then(() => "hi")
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and emit more", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            ).then(() => {
              createActivityCall("act1", undefined);
              return "hi";
            })
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [createScheduledActivityCommand("act1", undefined, 1)],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and chain more", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            ).then(() => createActivityCall("act1", undefined))
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled("act1", 1),
            activitySucceeded("hi", 1),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: Result.resolved("hi"),
      });
    });

    test("then then then then", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            ).then(() => {
              let x = 0;
              return Promise.all([
                createActivityCall("act1", undefined).then(() => {
                  x++;
                  return createActivityCall("boom", undefined);
                }),
                createSendSignalCall(
                  {
                    type: SignalTargetType.Execution,
                    executionId: "something",
                  },
                  "signal2",
                  undefined
                ).then(() => {
                  x++;
                  return createActivityCall("boom", undefined);
                }),
                createWorkflowCall("workflow1", undefined).then(() => {
                  x++;
                  return createActivityCall("boom", undefined);
                }),
                createExpectSignalCall("signal2").then(() => {
                  x++;
                  return createActivityCall("boom", undefined);
                }),
                createConditionCall(() => true).then(() => {
                  x++;
                  return createActivityCall("boom", undefined);
                }),
                createConditionCall(() => x >= 5).then(() =>
                  createActivityCall("boom", undefined)
                ),
              ]);
            })
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled("act1", 1),
            signalSent("something", "signal2", 2),
            workflowScheduled("workflow1", 3),
            activityScheduled("boom", 7), // from signal sent
            activityScheduled("boom", 8), // from condition true
            activitySucceeded("hi", 1), // succeed first activity
            activityScheduled("boom", 9), // after first act
            workflowSucceeded("something", 3), // succeed child workflow
            activityScheduled("boom", 10), // after child workflow
            signalReceived("signal2"), // signal for expect
            activityScheduled("boom", 11), // after expect
            activityScheduled("boom", 12), // after last condition
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
        commands: [],
        result: Result.resolved(["a", "b", "c", "d", "e", "f"]),
      });
    });
  });

  describe("catch", () => {
    test("chained result", async () => {
      await expect(
        execute(
          workflow(async () =>
            createActivityCall<number>("testme", undefined).catch(
              (result) => (result as Error).name + 1
            )
          ),
          [activityScheduled("testme", 0), activityFailed(new Error(""), 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: Result.resolved("Error1"),
      });
    });

    test("chained but does not complete", async () => {
      await expect(
        execute(
          workflow(async () =>
            createActivityCall<number>("testme", undefined).catch(
              (result) => (result as Error).name + 1
            )
          ),
          [activityScheduled("testme", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: undefined,
      });
    });

    test("chained using immediate resolutions", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            )
              .then(() => {
                throw new Error("");
              })
              .catch(() => "hi")
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and emit more", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            )
              .then(() => {
                throw new Error("");
              })
              .catch(() => {
                createActivityCall("act1", undefined);
                return "hi";
              })
          ),
          [signalSent("something", "signal", 0)],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [createScheduledActivityCommand("act1", undefined, 1)],
        result: Result.resolved("hi"),
      });
    });

    test("chained using immediate resolutions and chain more", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            )
              .then(() => {
                throw Error("");
              })
              .catch(() => createActivityCall("act1", undefined))
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled("act1", 1),
            activitySucceeded("hi", 1),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: Result.resolved("hi"),
      });
    });

    test("catch catch catch catch", async () => {
      await expect(
        execute(
          workflow(async () =>
            createSendSignalCall(
              {
                type: SignalTargetType.Execution,
                executionId: "something",
              },
              "signal"
            )
              .then(() => {
                throw new Error("");
              })
              .catch(() => {
                let x = 0;
                return Promise.all([
                  createActivityCall("act1", undefined).catch(() => {
                    x++;
                    return createActivityCall("boom", undefined);
                  }),
                  createSendSignalCall(
                    {
                      type: SignalTargetType.Execution,
                      executionId: "something",
                    },
                    "signal2",
                    undefined
                  )
                    .then(() => {
                      throw new Error("");
                    })
                    .catch(() => {
                      x++;
                      return createActivityCall("boom", undefined);
                    }),
                  createWorkflowCall("workflow1", undefined).catch(() => {
                    x++;
                    return createActivityCall("boom", undefined);
                  }),
                  createExpectSignalCall(
                    "signal2",
                    createAwaitTimerCall(Schedule.time(""))
                  ).catch(() => {
                    x++;
                    return createActivityCall("boom", undefined);
                  }),
                  createConditionCall(
                    () => false,
                    createAwaitTimerCall(Schedule.time(""))
                  )
                    .then(() => {
                      throw new Error("");
                    })
                    .catch(() => {
                      x++;
                      return createActivityCall("boom", undefined);
                    }),
                  createConditionCall(
                    () => x >= 1000000000000,
                    createAwaitTimerCall(Schedule.time(""))
                  )
                    .then(() => {
                      throw new Error("");
                    })
                    .catch(() => createActivityCall("boom", undefined)),
                ]);
              })
          ),
          [
            signalSent("something", "signal", 0),
            activityScheduled("act1", 1),
            signalSent("something", "signal2", 2),
            workflowScheduled("workflow1", 3),
            timerScheduled(4),
            timerScheduled(6),
            timerScheduled(8),
            activityScheduled("boom", 10), // from signal sent
            activityFailed("hi", 1), // succeed first activity
            activityScheduled("boom", 11), // after first act
            workflowFailed("something", 3), // succeed child workflow
            activityScheduled("boom", 12), // after child workflow
            timerCompleted(4),
            activityScheduled("boom", 13), // from expect timeout
            timerCompleted(6),
            activityScheduled("boom", 14), // from condition false timeout
            timerCompleted(8),
            activityScheduled("boom", 15), // from condition 10000000 timeout
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
        commands: [],
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
              createActivityCall<number>("testme", undefined).finally(() =>
                createActivityCall("actact", undefined)
              ),
              createSendSignalCall(
                { type: SignalTargetType.Execution, executionId: "" },
                "signal1"
              ).finally(() => createActivityCall("actact", undefined)),
            ]);
          }),
          [
            activityScheduled("testme", 0),
            signalSent("", "signal1", 1),
            activityScheduled("actact", 2),
            activitySucceeded("something", 0),
            activitySucceeded("something1", 2),
            activityScheduled("actact", 3),
            activitySucceeded("something2", 3),
          ],
          undefined
        )
      ).resolves.toEqual<WorkflowResult>({
        commands: [],
        result: Result.resolved(["something", undefined]),
      });
    });
  });
});
