import "jest";

import {
  scheduleActivity,
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
    const a = yield scheduleActivity("my-action", [event]);

    // dangling - it should still be scheduled
    scheduleActivity("my-action-0", [event]);

    const all = yield Activity.all([
      scheduleActivity("my-action-1", [event]),
      scheduleActivity("my-action-2", [event]),
    ]);
    return [a, all];
  } catch (err) {
    yield scheduleActivity("handle-error", [err]);
    return [];
  }
}

const event = "hello world";

test("no history", () => {
  expect(interpret(myWorkflow(event), [])).toMatchObject(<WorkflowResult>{
    actions: [scheduleActivity("my-action", [event], 0)],
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
      scheduleActivity("my-action-0", [event], 1),
      scheduleActivity("my-action-1", [event], 2),
      scheduleActivity("my-action-2", [event], 3),
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
    actions: [scheduleActivity("handle-error", ["error"], 1)],
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
          return yield scheduleActivity("process-item", [item]);
        })
      )
    );
  };

  expect(interpret(workflow(["a", "b"]), [])).toMatchObject(<WorkflowResult>{
    actions: [
      scheduleActivity("process-item", ["a"], 1),
      scheduleActivity("process-item", ["b"], 2),
    ],
  });

  expect(
    interpret(workflow(["a", "b"]), [
      scheduled("process-item", 1),
      scheduled("process-item", 2),
      completed("A", 1),
      completed("B", 2),
    ])
  ).toMatchObject(<WorkflowResult>{
    result: Result.resolved(["A", "B"]),
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
