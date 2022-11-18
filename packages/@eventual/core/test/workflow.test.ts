import { Program } from "../src/interpret";
import { createActivityCall } from "../src/activity-call";
import {
  ActivityCompleted,
  ActivityScheduled,
  WorkflowEventType,
  WorkflowStarted,
} from "../src/events";
import { progressWorkflow } from "../src/workflow";
import { DeterminismError } from "../src/error";

function* myWorkflow(event: any): Program<any> {
  yield createActivityCall("my-activity", [event]);
  yield createActivityCall("my-activity", [event]);
}

const started1: WorkflowStarted = {
  type: WorkflowEventType.WorkflowStarted,
  id: "1",
  input: `""`,
  timestamp: "",
};

const scheduled2: ActivityScheduled = {
  type: WorkflowEventType.ActivityScheduled,
  id: "2",
  name: "my-activity",
  seq: 0,
  timestamp: "",
};

const completed3: ActivityCompleted = {
  type: WorkflowEventType.ActivityCompleted,
  id: "3",
  seq: 0,
  duration: 100,
  result: 10,
  timestamp: "",
};

const completed4: ActivityCompleted = {
  type: WorkflowEventType.ActivityCompleted,
  id: "4",
  seq: 0,
  duration: 100,
  result: 10,
  timestamp: "",
};

test("history", () => {
  const { history } = progressWorkflow(myWorkflow, [started1], []);

  expect(history).toEqual([started1]);
});

test("start", () => {
  const { history } = progressWorkflow(myWorkflow, [], [started1]);

  expect(history).toEqual([started1]);
});

test("start with tasks", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [],
    [started1, scheduled2, completed3]
  );

  expect(history).toEqual([started1, scheduled2, completed3]);
});

test("start with history", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2],
    [completed3]
  );

  expect(history).toEqual([started1, scheduled2, completed3]);
});

test("start with duplicate events", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2, completed3],
    [completed3]
  );

  expect(history).toEqual([started1, scheduled2, completed3]);
});

test("start with invalid task events", () => {
  expect(() =>
    progressWorkflow(
      myWorkflow,
      [started1, scheduled2, completed3],
      [completed4, completed3]
    )
  ).toThrow(DeterminismError);
});

test("start with invalid workflow events", () => {
  expect(() =>
    progressWorkflow(
      myWorkflow,
      [started1, scheduled2, completed3, completed4],
      [completed3]
    )
  ).toThrow(DeterminismError);
});
