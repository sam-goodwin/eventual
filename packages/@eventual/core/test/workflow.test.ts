import "jest";

import { scheduleActivity, executeWorkflow, Activity } from "../src";

function* myWorkflow(event: any) {
  try {
    const a = yield scheduleActivity("my-action", [event]);

    // dangling - it should still be scheduled
    scheduleActivity("my-action-0", [event]);

    const all = yield Activity.all(
      scheduleActivity("my-action-1", [event]),
      scheduleActivity("my-action-2", [event])
    );
    return [a, all];
  } catch (err) {
    yield scheduleActivity("handle-error", [err]);
  }
}

const event = "hello world";

test("no history", () => {
  expect(executeWorkflow(myWorkflow(event), [])).toEqual([
    scheduleActivity("my-action", [event], 0),
  ]);
});

test("pending activity", () => {
  expect(executeWorkflow(myWorkflow(event), [{ pending: true }])).toEqual([]);
});

test("continue with result from resolved activity", () => {
  expect(
    executeWorkflow(myWorkflow(event), [{ value: "activity result" }])
  ).toEqual([
    scheduleActivity("my-action-1", [event], 1),
    scheduleActivity("my-action-2", [event], 2),
  ]);
});

test("catch and handle thrown error", () => {
  const error = new Error("you fucked up");
  expect(executeWorkflow(myWorkflow(event), [{ error }])).toEqual([
    scheduleActivity("handle-error", [error], 1),
  ]);
});

test("should capture dangling activity", () => {
  expect(
    executeWorkflow(myWorkflow(event), [{ value: "activity result" }])
  ).toEqual([
    scheduleActivity("my-action-0", [event], 1),
    scheduleActivity("my-action-1", [event], 2),
    scheduleActivity("my-action-2", [event], 3),
  ]);
});
