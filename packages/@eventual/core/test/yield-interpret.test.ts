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
  expect(interpret(myWorkflow(event), [])).toEqual(<WorkflowResult>{
    actions: [scheduleActivity("my-action", [event], 1)],
  });
});

test("determinism error if no corresponding ActivityScheduled", () => {
  expect(() =>
    interpret(myWorkflow(event), [
      // error: completed event should be after a scheduled event
      completed("result", 1),
    ])
  ).toThrow(expect.any(DeterminismError));
});

test("should continue with result of completed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-action", 1),
      completed("result", 1),
    ])
  ).toEqual(<WorkflowResult>{
    actions: [
      scheduleActivity("my-action-0", [event], 2),
      scheduleActivity("my-action-1", [event], 3),
      scheduleActivity("my-action-2", [event], 4),
    ],
  });
});

test("should catch error of failed Activity", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-action", 1),
      failed("error", 1),
    ])
  ).toEqual(<WorkflowResult>{
    actions: [scheduleActivity("handle-error", ["error"], 2)],
  });
});

test("should return final result", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-action", 1),
      completed("result", 1),
      scheduled("my-action-0", 2),
      scheduled("my-action-1", 3),
      scheduled("my-action-2", 4),
      completed("result-0", 2),
      completed("result-1", 3),
      completed("result-2", 4),
    ])
  ).toEqual(<WorkflowResult>{
    result: Result.resolved(["result", ["result-1", "result-2"]]),
    actions: [],
  });
});

test("should wait if partial results", () => {
  expect(
    interpret(myWorkflow(event), [
      scheduled("my-action", 1),
      completed("result", 1),
      scheduled("my-action-0", 2),
      scheduled("my-action-1", 3),
      scheduled("my-action-2", 4),
      completed("result-0", 2),
      completed("result-1", 3),
    ])
  ).toEqual(<WorkflowResult>{
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

  expect(interpret(workflow(), [])).toEqual(<WorkflowResult>{
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

  expect(interpret(workflow(), [])).toEqual(<WorkflowResult>{
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

  expect(interpret(workflow(), [])).toEqual(<WorkflowResult>{
    result: Result.resolved(["foo-0", "foo-1"]),
    actions: [],
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
