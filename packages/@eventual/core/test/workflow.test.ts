import "jest";

import {
  scheduleActivity,
  executeWorkflow,
  Activity,
  eventual,
  scheduleThread,
} from "../src";
import { createFailed, createPending, createResolved } from "../src/result";

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
  expect(executeWorkflow(myWorkflow(event), { threads: [[]] })).toEqual([
    scheduleActivity("my-action", [event], { id: 0 }),
  ]);
});

test("pending activity", () => {
  expect(
    executeWorkflow(myWorkflow(event), { threads: [[createPending()]] })
  ).toEqual([]);
});

test("continue with result from resolved activity", () => {
  expect(
    executeWorkflow(myWorkflow(event), {
      threads: [[createResolved("activity result")]],
    })
  ).toEqual([
    scheduleActivity("my-action-0", [event], { id: 1 }),
    scheduleActivity("my-action-1", [event], { id: 2 }),
    scheduleActivity("my-action-2", [event], { id: 3 }),
  ]);
});

test("catch and handle thrown error", () => {
  const error = new Error("you fucked up");
  expect(
    executeWorkflow(myWorkflow(event), { threads: [[createFailed(error)]] })
  ).toEqual([scheduleActivity("handle-error", [error], { id: 1 })]);
});

test("should capture dangling activity", () => {
  expect(
    executeWorkflow(myWorkflow(event), {
      threads: [[createResolved("activity result")]],
    })
  ).toEqual([
    scheduleActivity("my-action-0", [event], { id: 1 }),
    scheduleActivity("my-action-1", [event], { id: 2 }),
    scheduleActivity("my-action-2", [event], { id: 3 }),
  ]);
});

test("should return final result", () => {
  expect(
    executeWorkflow(myWorkflow(event), {
      threads: [
        [
          createResolved("activity result"),
          createResolved("result 0"),
          createResolved("result 1"),
          createResolved("result 2"),
        ],
      ],
    })
  ).toEqual(
    createResolved([
      "activity result",
      [
        // result 0 is dangling, so it should not be in the final array
        // "result 0",
        "result 1",
        "result 2",
      ],
    ])
  );
});

function* parallelWorkflow(event: any) {
  yield Activity.all(
    event.map(
      // registerFunction is an interceptor to scheduled the called function as a thread
      eventual(function* (item) {
        yield scheduleActivity("activity-0", [item]);
      })
    )
  );
}

test("isolate function calls into threads", () => {
  expect(
    executeWorkflow(parallelWorkflow([1, 2]), {
      threads: [],
    })
  ).toEqual([
    scheduleActivity("activity-0", [1], { threadID: 1, id: 0 }),
    scheduleActivity("activity-0", [2], { threadID: 2, id: 0 }),
  ]);
});
