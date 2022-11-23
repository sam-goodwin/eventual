import "jest";

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
  createStartActivityCommand,
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
    commands: [createStartActivityCommand("my-activity", [event], 0)],
  });
});

test("determinism error if no corresponding ActivityScheduled", () => {
  expect(() =>
    interpret(myWorkflow(event), [
      // error: completed event should be after a scheduled event
      completedActivity("result", 0),
    ])
  ).toThrow(expect.any(DeterminismError));
});

test("should continue with result of completed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduledActivity("my-activity", 0),
      completedActivity("result", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createStartActivityCommand("my-activity-0", [event], 1),
      createSleepUntilCommand("then", 2),
      createStartActivityCommand("my-activity-2", [event], 3),
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
    commands: [createStartActivityCommand("handle-error", ["error"], 1)],
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
      createStartActivityCommand("process-item", ["a"], 0),
      createStartActivityCommand("process-item", ["b"], 1),
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
      createStartActivityCommand("before", ["before"], 0),
      createStartActivityCommand("inside", ["a"], 1),
      createStartActivityCommand("inside", ["b"], 2),
      createStartActivityCommand("after", ["after"], 3),
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
    commands: [createStartActivityCommand("catch", [], 0)],
  });
  expect(
    interpret(workflow(), [
      scheduledActivity("catch", 0),
      completedActivity(undefined, 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createStartActivityCommand("finally", [], 1)],
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
      createStartActivityCommand("catch", [], 0),
      createStartActivityCommand("finally", [], 1),
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
      createStartActivityCommand("inside", ["good"], 0),
      createStartActivityCommand("inside", ["bad"], 1),
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
    commands: [createStartActivityCommand("catch", [], 2)],
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
    commands: [createStartActivityCommand("finally", [], 3)],
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
      createStartActivityCommand("a", [], 0),
      createStartActivityCommand("b", [], 1),
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
      createStartActivityCommand("a", [], 0),
      createStartActivityCommand("b", [], 1),
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
    commands: [createStartActivityCommand("call-a", [], 0)],
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
