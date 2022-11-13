import "jest";

import {
  scheduleAction,
  interpret,
  Activity,
  eventual,
  Result,
  WorkflowEventType,
  WorkflowResult,
  ActivityCompleted,
  ActivityScheduled,
  ActivityFailed,
} from "../src";
import { DeterminismError } from "../src/error";

function* myWorkflow(event: any): any {
  try {
    const a = yield scheduleAction("my-action", [event]);

    // dangling - it should still be scheduled
    scheduleAction("my-action-0", [event]);

    const all = yield Activity.all([
      scheduleAction("my-action-1", [event]),
      scheduleAction("my-action-2", [event]),
    ]);
    return [a, all];
  } catch (err) {
    yield scheduleAction("handle-error", [err]);
    return [];
  }
}

const event = "hello world";

test("no history", () => {
  expect(interpret(myWorkflow(event), [])).toMatchObject(<WorkflowResult>{
    actions: [scheduleAction("my-action", [event], 0)],
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
      scheduled("my-action", 0),
      completed("result", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    actions: [
      scheduleAction("my-action-0", [event], 1),
      scheduleAction("my-action-1", [event], 2),
      scheduleAction("my-action-2", [event], 3),
    ],
  });
});

test("should catch error of failed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-action", 0),
      failed("error", 0),
    ])
  ).toMatchObject(<WorkflowResult>{
    actions: [scheduleAction("handle-error", ["error"], 1)],
  });
});

test("should return final result", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-action", 0),
      completed("result", 0),
      scheduled("my-action-0", 1),
      scheduled("my-action-1", 2),
      scheduled("my-action-2", 3),
      completed("result-0", 1),
      completed("result-1", 2),
      completed("result-2", 3),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["result", ["result-1", "result-2"]]),
    actions: [],
  });
});

test("should wait if partial results", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-action", 0),
      completed("result", 0),
      scheduled("my-action-0", 1),
      scheduled("my-action-1", 2),
      scheduled("my-action-2", 3),
      completed("result-0", 1),
      completed("result-1", 2),
    ])
  ).toMatchObject(<WorkflowResult>{
    actions: [],
  });
});

test("should return result of inner function", () => {
  const workflow = function* () {
    const inner = eventual(function* () {
      return "foo";
    });
    // @ts-ignore
    const result = yield inner();
    return result;
  };

  expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved("foo"),
    actions: [],
  });
});

test("should await an un-awaited returned Activity", () => {
  const workflow = function* () {
    const inner = eventual(function* () {
      return "foo";
    });
    return inner();
  };

  expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved("foo"),
    actions: [],
  });
});

test("should await an un-awaited returned AwaitAll", () => {
  const workflow = function* () {
    let i = 0;
    const inner = eventual(function* () {
      return `foo-${i++}`;
    });
    // @ts-ignore
    return Activity.all([inner(), inner()]);
  };

  expect(interpret(workflow(), [])).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["foo-0", "foo-1"]),
    actions: [],
  });
});

test("should support Activity.all of function calls", () => {
  const workflow = function* (items: string[]) {
    return Activity.all(
      // @ts-ignore
      items.map(
        eventual(function* (item) {
          // @ts-ignore
          return yield scheduleAction("process-item", [item]);
        })
      )
    );
  };

  expect(interpret(workflow(["a", "b"]), [])).toMatchObject(<WorkflowResult>{
    actions: [
      scheduleAction("process-item", ["a"], 0),
      scheduleAction("process-item", ["b"], 1),
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

test("should have left-to-right determinism semantics for Activity.all", () => {
  const workflow = function* (items: string[]) {
    return Activity.all([
      scheduleAction("before", ["before"]),
      // @ts-ignore
      ...items.map(
        eventual(function* (item) {
          // @ts-ignore
          return yield scheduleAction("inside", [item]);
        })
      ),
      // @ts-ignore
      scheduleAction("after", ["after"]),
    ]);
  };

  const result = interpret(workflow(["a", "b"]), []);
  expect(result).toMatchObject(<WorkflowResult>{
    actions: [
      scheduleAction("before", ["before"], 0),
      scheduleAction("inside", ["a"], 1),
      scheduleAction("inside", ["b"], 2),
      scheduleAction("after", ["after"], 3),
    ],
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
