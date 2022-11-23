import {
  interpret,
  Eventual,
  Result,
  WorkflowResult,
  Program,
  chain,
  sleepFor,
  sleepUntil,
} from "../src/index.js";
import { createActivityCall } from "../src/activity-call.js";
import { DeterminismError } from "../src/error.js";
import {
  completedActivity,
  completedSleep,
  createSleepForCommand,
  createSleepUntilCommand,
  createStartActivityCommand as createScheduleActivityCommand,
  failedActivity,
  scheduledActivity,
  scheduledSleep,
} from "./command-util.js";
import { createSleepUntilCall } from "../src/sleep-call.js";

function* myWorkflow(event: any): Program<any> {
  try {
    const a: any = yield createActivityCall("my-activity", [event]);

    // dangling - it should still be scheduled
    createActivityCall("my-activity-0", [event]);

    const all = yield* Eventual.all([
      createSleepUntilCall("then"),
      createActivityCall("my-activity-2", [event]),
    ]);
    return [a, all];
  } catch (err) {
    yield createActivityCall("handle-error", [err]);
    return [];
  }
}

const event = "hello world";

test("no history", () => {
  expect(interpret(myWorkflow(event), [])).toMatchObject(<WorkflowResult>{
    commands: [createScheduleActivityCommand("my-activity", [event], 0)],
  });
});

test("should continue with result of completed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      completedActivity("result", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduleActivityCommand("my-activity-0", [event], 1),
      createSleepUntilCommand("then", 2),
      createScheduleActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should catch error of failed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      failedActivity("error", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduleActivityCommand("handle-error", ["error"], 1)],
  });
});

test("should return final result", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      completedActivity("result", 0),
      scheduledActivity("my-activity-0", 1),
      scheduledSleep("then", 2),
      scheduledActivity("my-activity-2", 3),
      completedActivity("result-0", 1),
      completedSleep(2),
      completedActivity("result-2", 3),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["result", [undefined, "result-2"]]),
    commands: [],
  });
});

test("should handle missing blocks", () => {
  expect(
    interpret(myWorkflow(event), [completedActivity("result", 0)])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduleActivityCommand("my-activity", [event], 0),
      createScheduleActivityCommand("my-activity-0", [event], 1),
      createSleepUntilCommand("then", 2),
      createScheduleActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should handle partial blocks", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      completedActivity("result", 0),
      scheduledActivity("my-activity-0", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createSleepUntilCommand("then", 2),
      createScheduleActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should handle partial blocks with partial completes", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      completedActivity("result", 0),
      scheduledActivity("my-activity-0", 1),
      completedActivity("result", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createSleepUntilCommand("then", 2),
      createScheduleActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should throw when scheduled does not correspond to call", () => {
  expect(() =>
    interpret(myWorkflow(event), [scheduledSleep("result", 0)])
  ).toThrow(DeterminismError);
});

test("should throw when there are more schedules than calls emitted", () => {
  expect(() =>
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      scheduledActivity("result", 1),
    ])
  ).toThrow(DeterminismError);
});

test("should throw when a completed precedes workflow state", () => {
  expect(() =>
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      scheduledActivity("result", 1),
      // the workflow does not return a seq: 2, where does this go?
      // note: a completed event can be accepted without a "scheduled" counterpart,
      // but the workflow must resolve the schedule before the complete
      // is applied.
      completedActivity("", 2),
    ])
  ).toThrow(DeterminismError);
});

test("should wait if partial results", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      completedActivity("result", 0),
      scheduledActivity("my-activity-0", 1),
      scheduledSleep("then", 2),
      scheduledActivity("my-activity-2", 3),
      completedActivity("result-0", 1),
      completedSleep(2),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [],
  });
});

test("should return result of inner function", () => {
  function* workflow() {
    const inner = chain(function* () {
      return "foo";
    });
    return yield* inner();
  }

  expect(interpret(workflow() as any, [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved("foo"),
    commands: [],
  });
});

test("should schedule sleep for", () => {
  function* workflow() {
    yield sleepFor(10);
  }

  expect(interpret(workflow() as any, [])).toMatchObject(<WorkflowResult>{
    commands: [createSleepForCommand(10, 0)],
  });
});

test("should not re-schedule sleep for", () => {
  function* workflow() {
    yield sleepFor(10);
  }

  expect(
    interpret(workflow() as any, [scheduledSleep("anything", 0)])
  ).toMatchObject(<WorkflowResult>{
    commands: [],
  });
});

test("should complete sleep for", () => {
  function* workflow() {
    yield sleepFor(10);
    return "done";
  }

  expect(
    interpret(workflow() as any, [
      scheduledSleep("anything", 0),
      completedSleep(0),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved("done"),
    commands: [],
  });
});

test("should schedule sleep until", () => {
  const now = new Date();

  function* workflow() {
    yield sleepUntil(now);
  }

  expect(interpret(workflow() as any, [])).toMatchObject(<WorkflowResult>{
    commands: [createSleepUntilCommand(now.toISOString(), 0)],
  });
});

test("should not re-schedule sleep until", () => {
  const now = new Date();

  function* workflow() {
    yield sleepUntil(now);
  }

  expect(
    interpret(workflow() as any, [scheduledSleep("anything", 0)])
  ).toMatchObject(<WorkflowResult>{
    commands: [],
  });
});

test("should complete sleep until", () => {
  const now = new Date();

  function* workflow() {
    yield sleepUntil(now);
    return "done";
  }

  expect(
    interpret(workflow() as any, [
      scheduledSleep("anything", 0),
      completedSleep(0),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved("done"),
    commands: [],
  });
});

describe("temple of doom", () => {
  /**
   * In our game, the player wants to get to the end of a hallway with traps.
   * The trap starts above the player and moves to a space in front of them
   * after a sleepUntil("X").
   *
   * If the trap has moved (X time), the player may jump to avoid it.
   * If the player jumps when then trap has not moved, they will beheaded.
   * If the player runs when the trap has been triggered without jumping, they will have their legs cut off.
   *
   * The trap is represented by a sleep command for X time.
   * The player starts running by returning the "run" activity.
   * The player jumps be returning the "jump" activity.
   * (this would be better modeled with signals and conditions, but the effect is the same, wait, complete)
   *
   * Jumping after avoid the trap has no effect.
   */
  function* workflow() {
    let trapDown = false;
    let jump = false;

    const startTrap = chain(function* () {
      yield createSleepUntilCall("X");
      trapDown = true;
    });
    const waitForJump = chain(function* () {
      yield createActivityCall("jump", []);
      jump = true;
    });

    startTrap();
    // the player can jump now
    waitForJump();

    yield createActivityCall("run", []);

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
  }

  test("run until blocked", () => {
    expect(interpret(workflow() as any, [])).toMatchObject(<WorkflowResult>{
      commands: [
        createSleepUntilCommand("X", 0),
        createScheduleActivityCommand("jump", [], 1),
        createScheduleActivityCommand("run", [], 2),
      ],
    });
  });

  test("waiting", () => {
    expect(
      interpret(workflow() as any, [
        scheduledSleep("X", 0),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
      ])
    ).toMatchObject(<WorkflowResult>{
      commands: [],
    });
  });

  test("trap triggers, player has not started, nothing happens", () => {
    // complete sleep, nothing happens
    expect(
      interpret(workflow() as any, [
        scheduledSleep("X", 0),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
        completedSleep(0),
      ])
    ).toMatchObject(<WorkflowResult>{
      commands: [],
    });
  });

  test("trap triggers and then the player starts, player is dead", () => {
    // complete sleep, turn on, release the player, dead
    expect(
      interpret(workflow() as any, [
        scheduledSleep("X", 0),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
        completedSleep(0),
        completedActivity("anything", 2),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("dead: lost your feet"),
      commands: [],
    });
  });

  test("trap triggers and then the player starts, player is dead, commands are out of order", () => {
    // complete sleep, turn on, release the player, dead
    expect(
      interpret(workflow() as any, [
        completedSleep(0),
        completedActivity("anything", 2),
        scheduledSleep("X", 0),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("dead: lost your feet"),
      commands: [],
    });
  });

  test("player starts and the trap has not triggered", () => {
    // release the player, not on, alive
    expect(
      interpret(workflow() as any, [
        scheduledSleep("X", 0),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
        completedActivity("anything", 2),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      commands: [],
    });
  });

  test("player starts and the trap has not triggered, completed before activity", () => {
    // release the player, not on, alive
    expect(
      interpret(workflow() as any, [
        scheduledSleep("X", 0),
        completedActivity("anything", 2),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      commands: [],
    });
  });

  test("player starts and the trap has not triggered, completed before any command", () => {
    // release the player, not on, alive
    expect(
      interpret(workflow() as any, [
        completedActivity("anything", 2),
        scheduledSleep("X", 0),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      commands: [],
    });
  });

  test("release the player before the trap triggers, player lives", () => {
    expect(
      interpret(workflow() as any, [
        scheduledSleep("X", 0),
        scheduledActivity("jump", 1),
        scheduledActivity("run", 2),
        completedActivity("anything", 2),
        completedSleep(0),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("alive"),
      commands: [],
    });
  });
});

test("should await an un-awaited returned Activity", () => {
  function* workflow() {
    const inner = chain(function* () {
      return "foo";
    });
    return inner();
  }

  expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved("foo"),
    commands: [],
  });
});

test("should await an un-awaited returned AwaitAll", () => {
  function* workflow() {
    let i = 0;
    const inner = chain(function* () {
      return `foo-${i++}`;
    });
    return Eventual.all([inner(), inner()]);
  }

  expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["foo-0", "foo-1"]),
    commands: [],
  });
});

test("should support Eventual.all of function calls", () => {
  function* workflow(items: string[]) {
    return Eventual.all(
      items.map(
        chain(function* (item): Program {
          return yield createActivityCall("process-item", [item]);
        })
      )
    );
  }

  expect(interpret(workflow(["a", "b"]), [])).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduleActivityCommand("process-item", ["a"], 0),
      createScheduleActivityCommand("process-item", ["b"], 1),
    ],
  });

  expect(
    interpret(workflow(["a", "b"]), [
      scheduledActivity("process-item", 0),
      scheduledActivity("process-item", 1),
      completedActivity("A", 0),
      completedActivity("B", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["A", "B"]),
  });
});

test("should have left-to-right determinism semantics for Eventual.all", () => {
  function* workflow(items: string[]) {
    return Eventual.all([
      createActivityCall("before", ["before"]),
      ...items.map(
        chain(function* (item) {
          yield createActivityCall("inside", [item]);
        })
      ),
      createActivityCall("after", ["after"]),
    ]);
  }

  const result = interpret(workflow(["a", "b"]), []);
  expect(result).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduleActivityCommand("before", ["before"], 0),
      createScheduleActivityCommand("inside", ["a"], 1),
      createScheduleActivityCommand("inside", ["b"], 2),
      createScheduleActivityCommand("after", ["after"], 3),
    ],
  });
});

test("try-catch-finally with yield in catch", () => {
  function* workflow() {
    try {
      throw new Error("error");
    } catch {
      yield createActivityCall("catch", []);
    } finally {
      yield createActivityCall("finally", []);
    }
  }
  expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
    commands: [createScheduleActivityCommand("catch", [], 0)],
  });
  expect(
    interpret(workflow(), [
      scheduledActivity("catch", 0),
      completedActivity(undefined, 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduleActivityCommand("finally", [], 1)],
  });
});

test("try-catch-finally with dangling promise in catch", () => {
  expect(
    interpret(
      (function* () {
        try {
          throw new Error("error");
        } catch {
          createActivityCall("catch", []);
        } finally {
          yield createActivityCall("finally", []);
        }
      })(),
      []
    )
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduleActivityCommand("catch", [], 0),
      createScheduleActivityCommand("finally", [], 1),
    ],
  });
});

test("throw error within nested function", () => {
  function* workflow(items: string[]) {
    try {
      yield* Eventual.all(
        items.map(
          chain(function* (item) {
            const result = yield createActivityCall("inside", [item]);

            if (result === "bad") {
              throw new Error("bad");
            }
          })
        )
      );
    } catch {
      yield createActivityCall("catch", []);
      return "returned in catch"; // this should be trumped by the finally
    } finally {
      yield createActivityCall("finally", []);
      return "returned in finally";
    }
  }
  expect(interpret(workflow(["good", "bad"]), [])).toMatchObject(<
    WorkflowResult
  >{
    commands: [
      createScheduleActivityCommand("inside", ["good"], 0),
      createScheduleActivityCommand("inside", ["bad"], 1),
    ],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      scheduledActivity("inside", 0),
      scheduledActivity("inside", 1),
      completedActivity("good", 0),
      completedActivity("bad", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduleActivityCommand("catch", [], 2)],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      scheduledActivity("inside", 0),
      scheduledActivity("inside", 1),
      completedActivity("good", 0),
      completedActivity("bad", 1),
      scheduledActivity("catch", 2),
      completedActivity("catch", 2),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduleActivityCommand("finally", [], 3)],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      scheduledActivity("inside", 0),
      scheduledActivity("inside", 1),
      completedActivity("good", 0),
      completedActivity("bad", 1),
      scheduledActivity("catch", 2),
      completedActivity("catch", 2),
      scheduledActivity("finally", 3),
      completedActivity("finally", 3),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved("returned in finally"),
    commands: [],
  });
});

test("properly evaluate yield* of sub-programs", () => {
  function* sub() {
    const item = yield* Eventual.all([
      createActivityCall("a", []),
      createActivityCall("b", []),
    ]);

    return item;
  }

  function* workflow() {
    return yield* sub();
  }

  expect(interpret(workflow(), [])).toMatchObject({
    commands: [
      //
      createScheduleActivityCommand("a", [], 0),
      createScheduleActivityCommand("b", [], 1),
    ],
  });

  expect(
    interpret(workflow(), [
      scheduledActivity("a", 0),
      scheduledActivity("b", 1),
      completedActivity("a", 0),
      completedActivity("b", 1),
    ])
  ).toMatchObject({
    result: Result.resolved(["a", "b"]),
    commands: [],
  });
});

test("properly evaluate yield of Eventual.all", () => {
  function* workflow() {
    // @ts-ignore
    const item = yield Eventual.all([
      createActivityCall("a", []),
      createActivityCall("b", []),
    ]);

    return item;
  }

  // @ts-ignore
  expect(interpret(workflow(), [])).toMatchObject({
    commands: [
      //
      createScheduleActivityCommand("a", [], 0),
      createScheduleActivityCommand("b", [], 1),
    ],
  });

  expect(
    // @ts-ignore
    interpret(workflow(), [
      scheduledActivity("a", 0),
      scheduledActivity("b", 1),
      completedActivity("a", 0),
      completedActivity("b", 1),
    ])
  ).toMatchObject({
    result: Result.resolved(["a", "b"]),
    commands: [],
  });
});

test("generator function returns an ActivityCall", () => {
  function* workflow() {
    return yield* sub();
  }

  const sub = chain(function* () {
    return createActivityCall("call-a", []);
  });

  expect(interpret(workflow(), [])).toMatchObject({
    commands: [createScheduleActivityCommand("call-a", [], 0)],
  });
  expect(
    interpret(workflow(), [
      scheduledActivity("call-a", 0),
      completedActivity("result", 0),
    ])
  ).toMatchObject({
    result: Result.resolved("result"),
    commands: [],
  });
});
