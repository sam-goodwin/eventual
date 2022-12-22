import { createActivityCall } from "../src/calls/activity-call.js";
import { chain } from "../src/chain.js";
import { EventualError, HeartbeatTimeout, Timeout } from "../src/error.js";
import {
  Context,
  createAwaitAll,
  Eventual,
  interpret,
  Program,
  Result,
  ServiceType,
  SERVICE_TYPE_FLAG,
  Signal,
  SignalTargetType,
  sleepFor,
  sleepUntil,
  Workflow,
  workflow as _workflow,
  WorkflowHandler,
  WorkflowResult,
} from "../src/index.js";
import { createSleepUntilCall } from "../src/calls/sleep-call.js";
import {
  activityCompleted,
  activityFailed,
  activityHeartbeatTimedOut,
  activityScheduled,
  activityTimedOut,
  completedSleep,
  conditionStarted,
  conditionTimedOut,
  createExpectSignalCommand,
  createPublishEventCommand,
  createScheduledActivityCommand,
  createScheduledWorkflowCommand,
  createSendSignalCommand,
  createSleepForCommand,
  createSleepUntilCommand,
  createStartConditionCommand,
  eventsPublished,
  scheduledSleep,
  signalReceived,
  signalSent,
  startedExpectSignal,
  timedOutExpectSignal,
  workflowCompleted,
  workflowFailed,
  workflowScheduled,
  workflowTimedOut,
} from "./command-util.js";
import { createExpectSignalCall } from "../src/calls/expect-signal-call.js";
import { createRegisterSignalHandlerCall } from "../src/calls/signal-handler-call.js";
import { createWorkflowCall } from "../src/calls/workflow-call.js";
import { createSendSignalCall } from "../src/calls/send-signal-call.js";
import { createConditionCall } from "../src/calls/condition-call.js";
import { createPublishEventsCall } from "../src/calls/send-events-call.js";

beforeAll(() => {
  process.env[SERVICE_TYPE_FLAG] = ServiceType.OrchestratorWorker;
});

afterAll(() => {
  delete process.env[SERVICE_TYPE_FLAG];
});

function* myWorkflow(event: any): Program<any> {
  try {
    const a: any = yield createActivityCall("my-activity", [event]);

    // dangling - it should still be scheduled
    createActivityCall("my-activity-0", [event]);

    const all = yield Eventual.all([
      createSleepUntilCall("then"),
      createActivityCall("my-activity-2", [event]),
    ]) as any;
    return [a, all];
  } catch (err) {
    yield createActivityCall("handle-error", [err]);
    return [];
  }
}

const event = "hello world";

const context: Context = {
  workflow: {
    name: "wf1",
  },
  execution: {
    id: "123",
    name: "wf1#123",
    startTime: "",
  },
};

const workflow = (() => {
  let n = 0;
  return <Input, Output>(
    handler: WorkflowHandler<Input, Output>
  ): Workflow<Input, Output> => {
    return _workflow(`wf${n++}`, handler);
  };
})();

test("no history", () => {
  expect(interpret(myWorkflow(event), [])).toMatchObject(<WorkflowResult>{
    commands: [createScheduledActivityCommand("my-activity", [event], 0)],
  });
});

test("should continue with result of completed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityCompleted("result", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand("my-activity-0", [event], 1),
      createSleepUntilCommand("then", 2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should fail on workflow timeout event", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      workflowTimedOut(),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Workflow timed out")),
    commands: [],
  });
});

test("should not continue on workflow timeout event", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      workflowTimedOut(),
      activityCompleted("result", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.failed(new Timeout("Workflow timed out")),
    commands: [],
  });
});

test("should catch error of failed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityFailed("error", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand(
        "handle-error",
        [new EventualError("error").toJSON()],
        1
      ),
    ],
  });
});

test("should catch error of timing out Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityTimedOut(0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand(
        "handle-error",
        [new Timeout("Activity Timed Out")],
        1
      ),
    ],
  });
});

test("should return final result", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityCompleted("result", 0),
      activityScheduled("my-activity-0", 1),
      scheduledSleep("then", 2),
      activityScheduled("my-activity-2", 3),
      activityCompleted("result-0", 1),
      completedSleep(2),
      activityCompleted("result-2", 3),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["result", [undefined, "result-2"]]),
    commands: [],
  });
});

test("should handle missing blocks", () => {
  expect(
    interpret(myWorkflow(event), [activityCompleted("result", 0)])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createScheduledActivityCommand("my-activity", [event], 0),
      createScheduledActivityCommand("my-activity-0", [event], 1),
      createSleepUntilCommand("then", 2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should handle partial blocks", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityCompleted("result", 0),
      activityScheduled("my-activity-0", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createSleepUntilCommand("then", 2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

test("should handle partial blocks with partial completes", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityCompleted("result", 0),
      activityScheduled("my-activity-0", 1),
      activityCompleted("result", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createSleepUntilCommand("then", 2),
      createScheduledActivityCommand("my-activity-2", [event], 3),
    ],
  });
});

describe("activity", () => {
  describe("heartbeat", () => {
    const wf = workflow(function* () {
      return createActivityCall("getPumpedUp", [], undefined, 100);
    });

    test("timeout from heartbeat seconds", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          activityScheduled("getPumpedUp", 0),
          activityHeartbeatTimedOut(0, 101),
        ])
      ).toMatchObject<WorkflowResult>({
        result: Result.failed(
          new HeartbeatTimeout("Activity Heartbeat TimedOut")
        ),
        commands: [],
      });
    });

    test("timeout after complete", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          activityScheduled("getPumpedUp", 0),
          activityCompleted("done", 0),
          activityHeartbeatTimedOut(0, 1000),
        ])
      ).toMatchObject<WorkflowResult>({
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("catch heartbeat timeout", () => {
      const wf = workflow(function* (): any {
        try {
          const result = yield createActivityCall(
            "getPumpedUp",
            [],
            undefined,
            1
          );
          return result;
        } catch (err) {
          if (err instanceof HeartbeatTimeout) {
            return err.message;
          }
          return "no";
        }
      });

      expect(
        interpret(wf.definition(undefined, context), [
          activityScheduled("getPumpedUp", 0),
          activityHeartbeatTimedOut(0, 10),
        ])
      ).toMatchObject<WorkflowResult>({
        result: Result.resolved("Activity Heartbeat TimedOut"),
        commands: [],
      });
    });
  });
});

test("should throw when scheduled does not correspond to call", () => {
  expect(
    interpret(myWorkflow(event), [scheduledSleep("result", 0)])
  ).toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "DeterminismError" }),
    commands: [],
  });
});

test("should throw when there are more schedules than calls emitted", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityScheduled("result", 1),
    ])
  ).toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "DeterminismError" }),
    commands: [],
  });
});

test("should throw when a completed precedes workflow state", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityScheduled("result", 1),
      // the workflow does not return a seq: 2, where does this go?
      // note: a completed event can be accepted without a "scheduled" counterpart,
      // but the workflow must resolve the schedule before the complete
      // is applied.
      activityCompleted("", 2),
    ])
  ).toMatchObject<WorkflowResult>({
    result: Result.failed({ name: "DeterminismError" }),
    commands: [],
  });
});

test("should wait if partial results", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityCompleted("result", 0),
      activityScheduled("my-activity-0", 1),
      scheduledSleep("then", 2),
      activityScheduled("my-activity-2", 3),
      activityCompleted("result-0", 1),
      completedSleep(2),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [],
  });
});

test("should return result of inner function", () => {
  function* workflow(): any {
    const inner = chain(function* () {
      return "foo";
    });
    return yield inner() as any;
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
        createScheduledActivityCommand("jump", [], 1),
        createScheduledActivityCommand("run", [], 2),
      ],
    });
  });

  test("waiting", () => {
    expect(
      interpret(workflow() as any, [
        scheduledSleep("X", 0),
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
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
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
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
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
        completedSleep(0),
        activityCompleted("anything", 2),
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
        activityCompleted("anything", 2),
        scheduledSleep("X", 0),
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
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
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
        activityCompleted("anything", 2),
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
        activityCompleted("anything", 2),
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
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
        activityCompleted("anything", 2),
        scheduledSleep("X", 0),
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
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
        activityScheduled("jump", 1),
        activityScheduled("run", 2),
        activityCompleted("anything", 2),
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

describe("AwaitAll", () => {
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
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("A", 0),
        activityCompleted("B", 1),
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
        createScheduledActivityCommand("before", ["before"], 0),
        createScheduledActivityCommand("inside", ["a"], 1),
        createScheduledActivityCommand("inside", ["b"], 2),
        createScheduledActivityCommand("after", ["after"], 3),
      ],
    });
  });
});

describe("AwaitAny", () => {
  test("should await an un-awaited returned AwaitAny", () => {
    function* workflow() {
      let i = 0;
      const inner = chain(function* () {
        return `foo-${i++}`;
      });
      return Eventual.any([inner(), inner()]);
    }

    expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
      result: Result.resolved("foo-0"),
      commands: [],
    });
  });

  test("should support Eventual.any of function calls", () => {
    function* workflow(items: string[]) {
      return Eventual.any(
        items.map(
          chain(function* (item): Program {
            return yield createActivityCall("process-item", [item]);
          })
        )
      );
    }

    expect(interpret(workflow(["a", "b"]), [])).toMatchObject(<WorkflowResult>{
      commands: [
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("A", 0),
        activityCompleted("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("A", 0),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("B"),
    });
  });

  test("should ignore failures when one failed", () => {
    function* workflow(items: string[]) {
      return Eventual.any(
        items.map(
          chain(function* (item): Program {
            return yield createActivityCall("process-item", [item]);
          })
        )
      );
    }

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("A", 0),
        activityCompleted("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("B"),
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("A", 0),
        activityFailed("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("B", 1),
        activityCompleted("A", 0),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });
  });

  test("should fail when all fail", () => {
    function* workflow(items: string[]) {
      return Eventual.any(
        items.map(
          chain(function* (item): Program {
            return yield createActivityCall("process-item", [item]);
          })
        )
      );
    }

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("A", 0),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: undefined,
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("A", 0),
        activityFailed("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.failed(new AggregateError(["A", "B"])),
    });
  });
});

describe("Race", () => {
  test("should await an un-awaited returned Race", () => {
    function* workflow() {
      let i = 0;
      const inner = chain(function* () {
        return `foo-${i++}`;
      });
      return Eventual.race([inner(), inner()]);
    }

    expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
      result: Result.resolved("foo-0"),
      commands: [],
    });
  });

  test("should support Eventual.race of function calls", () => {
    function* workflow(items: string[]) {
      return Eventual.race(
        items.map(
          chain(function* (item): Program {
            return yield createActivityCall("process-item", [item]);
          })
        )
      );
    }

    expect(interpret(workflow(["a", "b"]), [])).toMatchObject(<WorkflowResult>{
      commands: [
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("A", 0),
        activityCompleted("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("A", 0),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("A"),
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.resolved("B"),
    });
  });

  test("should return any settled call", () => {
    function* workflow(items: string[]) {
      return Eventual.race(
        items.map(
          chain(function* (item): Program {
            return yield createActivityCall("process-item", [item]);
          })
        )
      );
    }

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("A", 0),
        activityCompleted("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.failed(new EventualError("A").toJSON()),
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("B", 1),
      ])
    ).toMatchObject(<WorkflowResult>{
      result: Result.failed(new EventualError("B").toJSON()),
    });
  });
});

describe("AwaitAllSettled", () => {
  test("should await an un-awaited returned AwaitAllSettled", () => {
    function* workflow() {
      let i = 0;
      const inner = chain(function* () {
        return `foo-${i++}`;
      });
      return Eventual.allSettled([inner(), inner()]);
    }

    expect(interpret(workflow(), [])).toMatchObject<
      WorkflowResult<PromiseSettledResult<string>[]>
    >({
      result: Result.resolved([
        { status: "fulfilled", value: "foo-0" },
        { status: "fulfilled", value: "foo-1" },
      ]),
      commands: [],
    });
  });

  test("should support Eventual.allSettled of function calls", () => {
    function* workflow(items: string[]) {
      return Eventual.allSettled(
        items.map(
          chain(function* (item): Program {
            return yield createActivityCall("process-item", [item]);
          })
        )
      );
    }

    expect(interpret(workflow(["a", "b"]), [])).toMatchObject<
      WorkflowResult<PromiseSettledResult<string>[]>
    >({
      commands: [
        createScheduledActivityCommand("process-item", ["a"], 0),
        createScheduledActivityCommand("process-item", ["b"], 1),
      ],
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityCompleted("A", 0),
        activityCompleted("B", 1),
      ])
    ).toMatchObject<WorkflowResult<PromiseSettledResult<string>[]>>({
      result: Result.resolved([
        { status: "fulfilled", value: "A" },
        { status: "fulfilled", value: "B" },
      ]),
      commands: [],
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("A", 0),
        activityFailed("B", 1),
      ])
    ).toMatchObject<WorkflowResult<PromiseSettledResult<string>[]>>({
      result: Result.resolved([
        { status: "rejected", reason: new EventualError("A").toJSON() },
        { status: "rejected", reason: new EventualError("B").toJSON() },
      ]),
      commands: [],
    });

    expect(
      interpret(workflow(["a", "b"]), [
        activityScheduled("process-item", 0),
        activityScheduled("process-item", 1),
        activityFailed("A", 0),
        activityCompleted("B", 1),
      ])
    ).toMatchObject<WorkflowResult<PromiseSettledResult<string>[]>>({
      result: Result.resolved([
        { status: "rejected", reason: new EventualError("A").toJSON() },
        { status: "fulfilled", value: "B" },
      ]),
      commands: [],
    });
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
    commands: [createScheduledActivityCommand("catch", [], 0)],
  });
  expect(
    interpret(workflow(), [
      activityScheduled("catch", 0),
      activityCompleted(undefined, 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduledActivityCommand("finally", [], 1)],
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
      createScheduledActivityCommand("catch", [], 0),
      createScheduledActivityCommand("finally", [], 1),
    ],
  });
});

test("throw error within nested function", () => {
  function* workflow(items: string[]) {
    try {
      yield Eventual.all(
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
      createScheduledActivityCommand("inside", ["good"], 0),
      createScheduledActivityCommand("inside", ["bad"], 1),
    ],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      activityScheduled("inside", 0),
      activityScheduled("inside", 1),
      activityCompleted("good", 0),
      activityCompleted("bad", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduledActivityCommand("catch", [], 2)],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      activityScheduled("inside", 0),
      activityScheduled("inside", 1),
      activityCompleted("good", 0),
      activityCompleted("bad", 1),
      activityScheduled("catch", 2),
      activityCompleted("catch", 2),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduledActivityCommand("finally", [], 3)],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      activityScheduled("inside", 0),
      activityScheduled("inside", 1),
      activityCompleted("good", 0),
      activityCompleted("bad", 1),
      activityScheduled("catch", 2),
      activityCompleted("catch", 2),
      activityScheduled("finally", 3),
      activityCompleted("finally", 3),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved("returned in finally"),
    commands: [],
  });
});

test("properly evaluate yield* of sub-programs", () => {
  function* sub(): any {
    const item = yield Eventual.all([
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
      createScheduledActivityCommand("a", [], 0),
      createScheduledActivityCommand("b", [], 1),
    ],
  });

  expect(
    interpret(workflow(), [
      activityScheduled("a", 0),
      activityScheduled("b", 1),
      activityCompleted("a", 0),
      activityCompleted("b", 1),
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
      createScheduledActivityCommand("a", [], 0),
      createScheduledActivityCommand("b", [], 1),
    ],
  });

  expect(
    // @ts-ignore
    interpret(workflow(), [
      activityScheduled("a", 0),
      activityScheduled("b", 1),
      activityCompleted("a", 0),
      activityCompleted("b", 1),
    ])
  ).toMatchObject({
    result: Result.resolved(["a", "b"]),
    commands: [],
  });
});

test("generator function returns an ActivityCall", () => {
  function* workflow(): any {
    return yield sub();
  }

  const sub = chain(function* () {
    return createActivityCall("call-a", []);
  });

  expect(interpret(workflow(), [])).toMatchObject({
    commands: [createScheduledActivityCommand("call-a", [], 0)],
  });
  expect(
    interpret(workflow(), [
      activityScheduled("call-a", 0),
      activityCompleted("result", 0),
    ])
  ).toMatchObject({
    result: Result.resolved("result"),
    commands: [],
  });
});

test("workflow calling other workflow", () => {
  const wf1 = workflow(function* () {
    yield createActivityCall("call-a", []);
  });
  const wf2 = workflow(function* (): any {
    const result = yield createWorkflowCall(wf1.workflowName) as any;
    yield createActivityCall("call-b", []);
    return result;
  });

  expect(interpret(wf2.definition(undefined, context), [])).toMatchObject({
    commands: [createScheduledWorkflowCommand(wf1.workflowName, undefined, 0)],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled(wf1.workflowName, 0),
    ])
  ).toMatchObject({
    commands: [],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled(wf1.workflowName, 0),
      workflowCompleted("result", 0),
    ])
  ).toMatchObject({
    commands: [createScheduledActivityCommand("call-b", [], 1)],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled(wf1.workflowName, 0),
      workflowCompleted("result", 0),
      activityScheduled("call-b", 1),
    ])
  ).toMatchObject({
    commands: [],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled(wf1.workflowName, 0),
      workflowCompleted("result", 0),
      activityScheduled("call-b", 1),
      activityCompleted(undefined, 1),
    ])
  ).toMatchObject({
    result: Result.resolved("result"),
    commands: [],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled(wf1.workflowName, 0),
      workflowFailed("error", 0),
    ])
  ).toMatchObject({
    result: Result.failed(new EventualError("error").toJSON()),
    commands: [],
  });
});

describe("signals", () => {
  describe("expect signal", () => {
    const wf = workflow(function* (): any {
      const result = yield createExpectSignalCall("MySignal", 100 * 1000);

      return result ?? "done";
    });

    test("start expect signal", () => {
      expect(interpret(wf.definition(undefined, context), [])).toMatchObject(<
        WorkflowResult
      >{
        commands: [createExpectSignalCommand("MySignal", 0, 100 * 1000)],
      });
    });

    test("no signal", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
        ])
      ).toMatchObject(<WorkflowResult>{
        commands: [],
      });
    });

    test("match signal", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          signalReceived("MySignal"),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("match signal with payload", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          signalReceived("MySignal", { done: true }),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved({ done: true }),
        commands: [],
      });
    });

    test("timed out", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          timedOutExpectSignal("MySignal", 0),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.failed(new Timeout("Expect Signal Timed Out")),
        commands: [],
      });
    });

    test("timed out then signal", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          timedOutExpectSignal("MySignal", 0),
          signalReceived("MySignal", { done: true }),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.failed(new Timeout("Expect Signal Timed Out")),
        commands: [],
      });
    });

    test("match signal then timeout", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          signalReceived("MySignal"),
          timedOutExpectSignal("MySignal", 0),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("match signal twice", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          signalReceived("MySignal"),
          signalReceived("MySignal"),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("multiple of the same signal", () => {
      const wf = workflow(function* () {
        const wait1 = createExpectSignalCall("MySignal", 100 * 1000);
        const wait2 = createExpectSignalCall("MySignal", 100 * 1000);

        return Eventual.all([wait1, wait2]);
      });

      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          startedExpectSignal("MySignal", 1, 100 * 1000),
          signalReceived("MySignal", "done!!!"),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved(["done!!!", "done!!!"]),
        commands: [],
      });
    });

    test("expect then timeout", () => {
      const wf = workflow(function* (): any {
        yield createExpectSignalCall("MySignal", 100 * 1000);
        yield createExpectSignalCall("MySignal", 100 * 1000);
      });

      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          timedOutExpectSignal("MySignal", 0),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.failed({ name: "Timeout" }),
        commands: [],
      });
    });

    test("expect random signal then timeout", () => {
      const wf = workflow(function* (): any {
        yield createExpectSignalCall("MySignal", 100 * 1000);
        yield createExpectSignalCall("MySignal", 100 * 1000);
      });

      expect(
        interpret(wf.definition(undefined, context), [
          startedExpectSignal("MySignal", 0, 100 * 1000),
          signalReceived("SomethingElse"),
          timedOutExpectSignal("MySignal", 0),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.failed({ name: "Timeout" }),
        commands: [],
      });
    });
  });

  describe("signal handler", () => {
    const wf = workflow(function* () {
      let mySignalHappened = 0;
      let myOtherSignalHappened = 0;
      let myOtherSignalCompleted = 0;
      const mySignalHandler = createRegisterSignalHandlerCall(
        "MySignal",
        // the transformer will turn this closure into a generator wrapped in chain
        chain(function* () {
          mySignalHappened++;
        })
      );
      const myOtherSignalHandler = createRegisterSignalHandlerCall(
        "MyOtherSignal",
        function* (payload) {
          myOtherSignalHappened++;
          yield createActivityCall("act1", [payload]);
          myOtherSignalCompleted++;
        }
      );

      yield createSleepUntilCall("");

      mySignalHandler.dispose();
      myOtherSignalHandler.dispose();

      yield createSleepUntilCall("");

      return {
        mySignalHappened,
        myOtherSignalHappened,
        myOtherSignalCompleted,
      };
    });

    test("start", () => {
      expect(interpret(wf.definition(undefined, context), [])).toMatchObject(<
        WorkflowResult
      >{
        commands: [createSleepUntilCommand("", 0)],
      });
    });

    test("send signal, do not wake up", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MySignal"),
        ])
      ).toMatchObject(<WorkflowResult>{
        commands: [createSleepUntilCommand("", 0)],
      });
    });

    test("send signal, wake up", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MySignal"),
          scheduledSleep("", 0),
          completedSleep(0),
          scheduledSleep("", 1),
          completedSleep(1),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 1,
          myOtherSignalHappened: 0,
          myOtherSignalCompleted: 0,
        }),
        commands: [],
      });
    });

    test("send multiple signal, wake up", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MySignal"),
          signalReceived("MySignal"),
          signalReceived("MySignal"),
          scheduledSleep("", 0),
          completedSleep(0),
          scheduledSleep("", 1),
          completedSleep(1),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 3,
          myOtherSignalHappened: 0,
          myOtherSignalCompleted: 0,
        }),
        commands: [],
      });
    });

    test("send signal after dispose", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          scheduledSleep("", 0),
          completedSleep(0),
          signalReceived("MySignal"),
          signalReceived("MySignal"),
          signalReceived("MySignal"),
          scheduledSleep("", 1),
          completedSleep(1),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 0,
          myOtherSignalCompleted: 0,
        }),
        commands: [],
      });
    });

    test("send other signal, do not complete", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MyOtherSignal", "hi"),
        ])
      ).toMatchObject(<WorkflowResult>{
        commands: [
          createSleepUntilCommand("", 0),
          createScheduledActivityCommand("act1", ["hi"], 1),
        ],
      });
    });

    test("send multiple other signal, do not complete", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MyOtherSignal", "hi"),
          signalReceived("MyOtherSignal", "hi2"),
        ])
      ).toMatchObject(<WorkflowResult>{
        commands: [
          createSleepUntilCommand("", 0),
          createScheduledActivityCommand("act1", ["hi"], 1),
          createScheduledActivityCommand("act1", ["hi2"], 2),
        ],
      });
    });

    test("send other signal, wake sleep, with act scheduled", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MyOtherSignal", "hi"),
          scheduledSleep("", 0),
          completedSleep(0),
          activityScheduled("act1", 1),
          scheduledSleep("", 2),
          completedSleep(2),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 1,
          myOtherSignalCompleted: 0,
        }),
        commands: [],
      });
    });

    test("send other signal, wake sleep, complete activity", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MyOtherSignal", "hi"),
          scheduledSleep("", 0),
          activityScheduled("act1", 1),
          activityCompleted("act1", 1),
          completedSleep(0),
          scheduledSleep("", 2),
          completedSleep(2),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 1,
          myOtherSignalCompleted: 1,
        }),
        commands: [],
      });
    });

    test("send other signal, wake sleep, complete activity after dispose", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalReceived("MyOtherSignal", "hi"),
          scheduledSleep("", 0),
          completedSleep(0),
          activityScheduled("act1", 1),
          activityCompleted("act1", 1),
          scheduledSleep("", 2),
          completedSleep(2),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved({
          mySignalHappened: 0,
          myOtherSignalHappened: 1,
          myOtherSignalCompleted: 1,
        }),
        commands: [],
      });
    });

    test("send other signal after dispose", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          scheduledSleep("", 0),
          completedSleep(0),
          signalReceived("MyOtherSignal", "hi"),
          scheduledSleep("", 1),
          completedSleep(1),
        ])
      ).toMatchObject(<WorkflowResult>{
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
    const mySignal = new Signal("MySignal");
    const wf = workflow(function* (): any {
      createSendSignalCall(
        { type: SignalTargetType.Execution, executionId: "someExecution" },
        mySignal.id
      );

      const childWorkflow = createWorkflowCall("childWorkflow");

      childWorkflow.signal(mySignal);

      return yield childWorkflow;
    });

    test("start", () => {
      expect(interpret(wf.definition(undefined, context), [])).toMatchObject(<
        WorkflowResult
      >{
        commands: [
          createSendSignalCommand(
            {
              type: SignalTargetType.Execution,
              executionId: "someExecution",
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

    test("partial", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalSent("someExec", "MySignal", 0),
        ])
      ).toMatchObject(<WorkflowResult>{
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

    test("matching scheduled events", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalSent("someExec", "MySignal", 0),
          workflowScheduled("childWorkflow", 1),
          signalSent("someExecution", "MySignal", 2),
        ])
      ).toMatchObject(<WorkflowResult>{
        commands: [],
      });
    });

    test("complete", () => {
      expect(
        interpret(wf.definition(undefined, context), [
          signalSent("someExec", "MySignal", 0),
          workflowScheduled("childWorkflow", 1),
          signalSent("someExecution", "MySignal", 2),
          workflowCompleted("done", 1),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });

    test("yielded sendSignal does nothing", () => {
      const wf = workflow(function* (): any {
        yield createSendSignalCall(
          { type: SignalTargetType.Execution, executionId: "someExecution" },
          mySignal.id
        );

        const childWorkflow = createWorkflowCall("childWorkflow");

        yield childWorkflow.signal(mySignal);

        return yield childWorkflow;
      });

      expect(
        interpret(wf.definition(undefined, context), [
          signalSent("someExec", "MySignal", 0),
          workflowScheduled("childWorkflow", 1),
          signalSent("someExecution", "MySignal", 2),
          workflowCompleted("done", 1),
        ])
      ).toMatchObject(<WorkflowResult>{
        result: Result.resolved("done"),
        commands: [],
      });
    });
  });
});

describe("condition", () => {
  test("already true condition does not emit events", () => {
    const wf = workflow(function* (): any {
      yield createConditionCall(() => true);
    });

    expect(
      interpret(wf.definition(undefined, context), [])
    ).toMatchObject<WorkflowResult>({
      commands: [],
    });
  });

  test("false condition emits events", () => {
    const wf = workflow(function* (): any {
      yield createConditionCall(() => false);
    });

    expect(
      interpret(wf.definition(undefined, context), [])
    ).toMatchObject<WorkflowResult>({
      commands: [createStartConditionCommand(0)],
    });
  });

  test("false condition emits events with timeout", () => {
    const wf = workflow(function* (): any {
      yield createConditionCall(() => false, 100);
    });

    expect(
      interpret(wf.definition(undefined, context), [])
    ).toMatchObject<WorkflowResult>({
      commands: [createStartConditionCommand(0, 100)],
    });
  });

  test("false condition does not re-emit", () => {
    const wf = workflow(function* (): any {
      yield createConditionCall(() => false, 100);
    });

    expect(
      interpret(wf.definition(undefined, context), [conditionStarted(0)])
    ).toMatchObject<WorkflowResult>({
      commands: [],
    });
  });

  const signalConditionFlow = workflow(function* (): any {
    let yes = false;
    createRegisterSignalHandlerCall("Yes", () => {
      yes = true;
    });
    if (!(yield createConditionCall(() => yes) as any)) {
      return "timed out";
    }
    return "done";
  });

  test("trigger success", () => {
    expect(
      interpret(signalConditionFlow.definition(undefined, context), [
        conditionStarted(0),
        signalReceived("Yes"),
      ])
    ).toMatchObject<WorkflowResult>({
      result: Result.resolved("done"),
      commands: [],
    });
  });

  test("trigger success eventually", () => {
    expect(
      interpret(signalConditionFlow.definition(undefined, context), [
        conditionStarted(0),
        signalReceived("No"),
        signalReceived("No"),
        signalReceived("No"),
        signalReceived("No"),
        signalReceived("Yes"),
      ])
    ).toMatchObject<WorkflowResult>({
      result: Result.resolved("done"),
      commands: [],
    });
  });

  test("never trigger when state changes", () => {
    const signalConditionOnAndOffFlow = workflow(function* (): any {
      let yes = false;
      createRegisterSignalHandlerCall("Yes", () => {
        yes = true;
      });
      createRegisterSignalHandlerCall("Yes", () => {
        yes = false;
      });
      yield createConditionCall(() => yes);
      return "done";
    });

    expect(
      interpret(signalConditionOnAndOffFlow.definition(undefined, context), [
        conditionStarted(0),
        signalReceived("Yes"),
      ])
    ).toMatchObject<WorkflowResult>({
      commands: [],
    });
  });

  test("trigger timeout", () => {
    expect(
      interpret(signalConditionFlow.definition(undefined, context), [
        conditionStarted(0),
        conditionTimedOut(0),
      ])
    ).toMatchObject<WorkflowResult>({
      result: Result.resolved("timed out"),
      commands: [],
    });
  });

  test("trigger success before timeout", () => {
    expect(
      interpret(signalConditionFlow.definition(undefined, context), [
        conditionStarted(0),
        signalReceived("Yes"),
        conditionTimedOut(0),
      ])
    ).toMatchObject<WorkflowResult>({
      result: Result.resolved("done"),
      commands: [],
    });
  });

  test("trigger timeout before success", () => {
    expect(
      interpret(signalConditionFlow.definition(undefined, context), [
        conditionStarted(0),
        conditionTimedOut(0),
        signalReceived("Yes"),
      ])
    ).toMatchObject<WorkflowResult>({
      result: Result.resolved("timed out"),
      commands: [],
    });
  });

  test("condition as simple generator", () => {
    const wf = workflow(function* (): any {
      yield createConditionCall(() => false);
      return "done";
    });

    expect(
      interpret(wf.definition(undefined, context), [])
    ).toMatchObject<WorkflowResult>({
      commands: [createStartConditionCommand(0)],
    });
  });
});

test("nestedChains", () => {
  const wf = workflow(function* () {
    const funcs = {
      a: chain(function* () {
        yield createSleepUntilCall("");
      }),
    };

    Object.fromEntries(
      yield createAwaitAll(
        Object.entries(funcs).map(
          chain(function* ([name, func]) {
            return [name, yield func()];
          })
        )
      )
    );
  });

  expect(
    interpret(wf.definition(undefined, context), [])
  ).toMatchObject<WorkflowResult>({
    commands: [createSleepUntilCommand("", 0)],
  });
});

test("mixing closure types", () => {
  var workflow4 = workflow(function* () {
    const greetings = Eventual.all(
      ["sam", "chris", "sam"].map((name) => createActivityCall("hello", [name]))
    );
    const greetings2 = Eventual.all(
      ["sam", "chris", "sam"].map(
        chain(function* (name) {
          const greeting = yield createActivityCall("hello", [name]);
          return greeting * 2;
        })
      )
    );
    const greetings3 = Eventual.all([
      createActivityCall("hello", ["sam"]),
      createActivityCall("hello", ["chris"]),
      createActivityCall("hello", ["sam"]),
    ]);
    return Eventual.all([greetings as any, greetings2, greetings3]);
  });

  expect(
    interpret(workflow4.definition(undefined, context), [])
  ).toEqual<WorkflowResult>({
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

  expect(
    interpret(workflow4.definition(undefined, context), [
      activityScheduled("hello", 0),
      activityScheduled("hello", 1),
      activityScheduled("hello", 2),
      activityScheduled("hello", 3),
      activityScheduled("hello", 4),
      activityScheduled("hello", 5),
      activityScheduled("hello", 6),
      activityScheduled("hello", 7),
      activityScheduled("hello", 8),
    ])
  ).toEqual<WorkflowResult>({
    commands: [],
  });

  expect(
    interpret(workflow4.definition(undefined, context), [
      activityScheduled("hello", 0),
      activityScheduled("hello", 1),
      activityScheduled("hello", 2),
      activityScheduled("hello", 3),
      activityScheduled("hello", 4),
      activityScheduled("hello", 5),
      activityScheduled("hello", 6),
      activityScheduled("hello", 7),
      activityScheduled("hello", 8),
      activityCompleted(1, 0),
      activityCompleted(2, 1),
      activityCompleted(3, 2),
      activityCompleted(4, 3),
      activityCompleted(5, 4),
      activityCompleted(6, 5),
      activityCompleted(7, 6),
      activityCompleted(8, 7),
      activityCompleted(9, 8),
    ])
  ).toEqual<WorkflowResult>({
    result: Result.resolved([
      [1, 2, 3],
      [8, 10, 12],
      [7, 8, 9],
    ]),
    commands: [],
  });
});

test("workflow with synchronous function", () => {
  var workflow4 = workflow(function (): any {
    return createActivityCall("hi", []);
  });

  expect(
    interpret(workflow4.definition(undefined, context), [])
  ).toEqual<WorkflowResult>({
    commands: [createScheduledActivityCommand("hi", [], 0)],
  });

  expect(
    interpret(workflow4.definition(undefined, context), [
      activityScheduled("hi", 0),
      activityCompleted("result", 0),
    ])
  ).toEqual<WorkflowResult>({
    result: Result.resolved("result"),
    commands: [],
  });
});

test("publish event", () => {
  const wf = workflow(function* () {
    yield createPublishEventsCall([
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

  expect(
    interpret(wf.definition(undefined, context), [])
  ).toEqual<WorkflowResult>({
    // promise should be instantly resolved
    result: Result.resolved("done!"),
    commands: [createPublishEventCommand(events, 0)],
  });

  expect(
    interpret(wf.definition(undefined, context), [eventsPublished(events, 0)])
  ).toEqual<WorkflowResult>({
    // promise should be instantly resolved
    result: Result.resolved("done!"),
    commands: [],
  });
});
