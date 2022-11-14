import "jest";

import {
  interpret,
  eventual,
  Future,
  Result,
  WorkflowEventType,
  WorkflowResult,
  ActivityCompleted,
  ActivityScheduled,
  ActivityFailed,
  Program,
} from "../src/index.js";
import { createActivityCall } from "../src/activity-call.js";
import { DeterminismError } from "../src/error.js";

function* myWorkflow(event: any): Program<any> {
  try {
    const a: any = yield createActivityCall("my-activity", [event]);

    // dangling - it should still be scheduled
    createActivityCall("my-activity-0", [event]);

    const all = yield* Future.all([
      createActivityCall("my-activity-1", [event]),
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
    commands: [createActivityCall("my-activity", [event], 0)],
  });
});

test("determinism error if no corresponding ActivityScheduled", () => {
  expect(() =>
    interpret(myWorkflow(event), [
      // error: completed event should be after a scheduled event
      completed("result", 0),
    ])
  ).toThrow(expect.any(DeterminismError));
});

test("should continue with result of completed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-activity", 0),
      completed("result", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [
      createActivityCall("my-activity-0", [event], 1),
      createActivityCall("my-activity-1", [event], 2),
      createActivityCall("my-activity-2", [event], 3),
    ],
  });
});

test("should catch error of failed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-activity", 0),
      failed("error", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createActivityCall("handle-error", ["error"], 1)],
  });
});

test("should return final result", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-activity", 0),
      completed("result", 0),
      scheduled("my-activity-0", 1),
      scheduled("my-activity-1", 2),
      scheduled("my-activity-2", 3),
      completed("result-0", 1),
      completed("result-1", 2),
      completed("result-2", 3),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["result", ["result-1", "result-2"]]),
    commands: [],
  });
});

test("should wait if partial results", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-activity", 0),
      completed("result", 0),
      scheduled("my-activity-0", 1),
      scheduled("my-activity-1", 2),
      scheduled("my-activity-2", 3),
      completed("result-0", 1),
      completed("result-1", 2),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [],
  });
});

test("should return result of inner function", () => {
  function* workflow() {
    const inner = eventual(function* () {
      return "foo";
    });
    return yield* inner();
  }

  expect(interpret(workflow() as any, [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved("foo"),
    commands: [],
  });
});

test("should await an un-awaited returned Activity", () => {
  function* workflow() {
    const inner = eventual(function* () {
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
    const inner = eventual(function* () {
      return `foo-${i++}`;
    });
    return Future.all([inner(), inner()]);
  }

  expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["foo-0", "foo-1"]),
    commands: [],
  });
});

test("should support Future.all of function calls", () => {
  function* workflow(items: string[]) {
    return Future.all(
      items.map(
        eventual(function* (item): Program {
          return yield createActivityCall("process-item", [item]);
        })
      )
    );
  }

  expect(interpret(workflow(["a", "b"]), [])).toMatchObject(<WorkflowResult>{
    commands: [
      createActivityCall("process-item", ["a"], 0),
      createActivityCall("process-item", ["b"], 1),
    ],
  });

  expect(
    interpret(workflow(["a", "b"]), [
      scheduled("process-item", 0),
      scheduled("process-item", 1),
      completed("A", 0),
      completed("B", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["A", "B"]),
  });
});

test("should have left-to-right determinism semantics for Future.all", () => {
  function* workflow(items: string[]) {
    return Future.all([
      createActivityCall("before", ["before"]),
      ...items.map(
        eventual(function* (item) {
          yield createActivityCall("inside", [item]);
        })
      ),
      createActivityCall("after", ["after"]),
    ]);
  }

  const result = interpret(workflow(["a", "b"]), []);
  expect(result).toMatchObject(<WorkflowResult>{
    commands: [
      createActivityCall("before", ["before"], 0),
      createActivityCall("inside", ["a"], 1),
      createActivityCall("inside", ["b"], 2),
      createActivityCall("after", ["after"], 3),
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
    commands: [createActivityCall("catch", [], 0)],
  });
  expect(
    interpret(workflow(), [scheduled("catch", 0), completed(undefined, 0)])
  ).toMatchObject(<WorkflowResult>{
    commands: [createActivityCall("finally", [], 1)],
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
      createActivityCall("catch", [], 0),
      createActivityCall("finally", [], 1),
    ],
  });
});

test("throw error within nested function", () => {
  function* workflow(items: string[]) {
    try {
      yield* Future.all(
        items.map(
          eventual(function* (item) {
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
      createActivityCall("inside", ["good"], 0),
      createActivityCall("inside", ["bad"], 1),
    ],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      scheduled("inside", 0),
      scheduled("inside", 1),
      completed("good", 0),
      completed("bad", 1),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createActivityCall("catch", [], 2)],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      scheduled("inside", 0),
      scheduled("inside", 1),
      completed("good", 0),
      completed("bad", 1),
      scheduled("catch", 2),
      completed("catch", 2),
    ])
  ).toMatchObject(<WorkflowResult>{
    commands: [createActivityCall("finally", [], 3)],
  });
  expect(
    interpret(workflow(["good", "bad"]), [
      scheduled("inside", 0),
      scheduled("inside", 1),
      completed("good", 0),
      completed("bad", 1),
      scheduled("catch", 2),
      completed("catch", 2),
      scheduled("finally", 3),
      completed("finally", 3),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved("returned in finally"),
    commands: [],
  });
});

test("properly evaluate yield* of sub-programs", () => {
  function* sub() {
    const item = yield* Future.all([
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
      createActivityCall("a", [], 0),
      createActivityCall("b", [], 1),
    ],
  });

  expect(
    interpret(workflow(), [
      scheduled("a", 0),
      scheduled("b", 1),
      completed("a", 0),
      completed("b", 1),
    ])
  ).toMatchObject({
    result: Result.resolved(["a", "b"]),
    commands: [],
  });
});

function completed(result: any, seq: number): ActivityCompleted {
  return {
    type: WorkflowEventType.ActivityCompleted,
    id: "id",
    result,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

function failed(error: any, seq: number): ActivityFailed {
  return {
    type: WorkflowEventType.ActivityFailed,
    id: "id",
    error,
    message: "message",
    seq,
    timestamp: new Date(0).toISOString(),
  };
}

function scheduled(name: string, seq: number): ActivityScheduled {
  return {
    type: WorkflowEventType.ActivityScheduled,
    id: "id",
    name,
    seq,
    timestamp: new Date(0).toISOString(),
  };
}
