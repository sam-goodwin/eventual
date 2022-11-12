import "jest";

import {
  scheduleActivity,
  executeWorkflow,
  Activity,
  eventual,
  Result,
  WorkflowEventType,
  WorkflowStarted,
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
  expect(executeWorkflow(myWorkflow(event), [])).toEqual(<WorkflowResult>{
    actions: [scheduleActivity("my-action", [event], 1)],
  });
});

test("determinism error if no corresponding ActivityScheduled", () => {
  expect(() =>
    executeWorkflow(myWorkflow(event), [
      // error: completed event should be after a scheduled event
      completed("result", 1),
    ])
  ).toThrow(expect.any(DeterminismError));
});

test("should continue with result of completed Activity", () => {
  expect(
    executeWorkflow(myWorkflow(event), [
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
    executeWorkflow(myWorkflow(event), [
      scheduled("my-action", 1),
      failed("error", 1),
    ])
  ).toEqual(<WorkflowResult>{
    actions: [scheduleActivity("handle-error", ["error"], 2)],
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
