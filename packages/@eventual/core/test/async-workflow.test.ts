import "jest";

import { scheduleActivity, executeWorkflow, eventual, activity } from "../src";
import { createFailed, createPending, createResolved } from "../src/result";

const myAction = activity("my-action", async (event: any) => {
  return event;
});

const myAction0 = activity("my-action-0", async (event: any) => {
  return event;
});
const myAction1 = activity("my-action-1", async (event: any) => {
  return event;
});
const myAction2 = activity("my-action-2", async (event: any) => {
  return event;
});

const handleError = activity("handle-error", async (err: any) => {
  return err;
});

const myWorkflow = eventual(async function (event: any) {
  try {
    const a = await myAction(event);

    // dangling - it should still be scheduled
    myAction0(event);

    const all = await Promise.all([
      myAction1(event),
      //
      myAction2(event),
    ]);
    return [a, all];
  } catch (err) {
    await handleError(err);
    return [];
  }
});

const event = "hello world";

test.skip("no history", () => {
  expect(executeWorkflow(myWorkflow(event), { threads: [[]] })).toEqual([
    scheduleActivity("my-action", [event], { id: 0 }),
  ]);
});

test.skip("pending activity", () => {
  expect(
    executeWorkflow(myWorkflow(event), { threads: [[createPending()]] })
  ).toEqual([]);
});

test.skip("continue with result from resolved activity", () => {
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

test.skip("catch and handle thrown error", () => {
  const error = new Error("you fucked up");
  expect(
    executeWorkflow(myWorkflow(event), { threads: [[createFailed(error)]] })
  ).toEqual([scheduleActivity("handle-error", [error], { id: 1 })]);
});

test.skip("should capture dangling activity", () => {
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

test.skip("should return final result", () => {
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

const parallelWorkflow = eventual(async (event: any) => {
  await Promise.all(
    event.map(async (item: any) => {
      await myAction0(item);
    })
  );
});

test.skip("isolate function calls into threads", () => {
  expect(
    executeWorkflow(parallelWorkflow([1, 2]), {
      threads: [],
    })
  ).toEqual([
    scheduleActivity("my-action-0", [1], { threadID: 1, id: 0 }),
    scheduleActivity("my-action-0", [2], { threadID: 2, id: 0 }),
  ]);
});
