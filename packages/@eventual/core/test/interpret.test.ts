import "jest";

import { createActivityCall } from "../src/activity-call.js";
import { chain } from "../src/chain.js";
import { DeterminismError } from "../src/error.js";
import {
  Context,
  Eventual,
  interpret,
  Program,
  Result,
  sleepFor,
  sleepUntil,
  workflow,
  WorkflowResult,
} from "../src/index.js";
import { createSleepUntilCall } from "../src/sleep-call.js";
import {
  activityCompleted,
  activityFailed,
  activityScheduled,
  completedSleep,
  createScheduledActivityCommand,
  createScheduledWorkflowCommand,
  createSleepForCommand,
  createSleepUntilCommand,
  scheduledSleep,
  workflowCompleted,
  workflowFailed,
  workflowScheduled,
} from "./command-util.js";

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
    commands: [createScheduledActivityCommand("my-activity", [event], 0)],
  });
});

test("determinism error if no corresponding ActivityScheduled", () => {
  expect(() =>
    interpret(myWorkflow(event), [
      // error: completed event should be after a scheduled event
      activityCompleted("result", 0),
    ])
  ).toThrow(expect.any(DeterminismError));
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

test("should catch error of failed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      activityScheduled("my-activity", 0),
      activityFailed("error", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createScheduledActivityCommand("handle-error", ["error"], 1)],
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
  function* workflow() {
    return yield* sub();
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
  const wf1 = workflow("wf1", function* () {
    yield createActivityCall("call-a", []);
  });
  // @ts-ignore
  const wf2 = workflow("wf2", function* () {
    // @ts-ignore
    const result = yield wf1();
    yield createActivityCall("call-b", []);
    return result;
  });

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

  expect(interpret(wf2.definition(undefined, context), [])).toMatchObject({
    commands: [createScheduledWorkflowCommand("wf1", undefined, 0)],
  });

  expect(
    interpret(wf2.definition(undefined, context), [workflowScheduled("wf1", 0)])
  ).toMatchObject({
    commands: [],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled("wf1", 0),
      workflowCompleted("result", 0),
    ])
  ).toMatchObject({
    commands: [createScheduledActivityCommand("call-b", [], 1)],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled("wf1", 0),
      workflowCompleted("result", 0),
      activityScheduled("call-b", 1),
    ])
  ).toMatchObject({
    commands: [],
  });

  expect(
    interpret(wf2.definition(undefined, context), [
      workflowScheduled("wf1", 0),
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
      workflowScheduled("wf1", 0),
      workflowFailed("error", 0),
    ])
  ).toMatchObject({
    result: Result.failed("error"),
    commands: [],
  });
});
