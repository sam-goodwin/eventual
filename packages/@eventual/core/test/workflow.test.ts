import { Program } from "../src/interpret";
import { createActivityCall } from "../src/activity-call";
import {
  ActivityCompleted,
  ActivityScheduled,
  WorkflowEventType,
  WorkflowStarted,
} from "../src/events";
import { progressWorkflow } from "../src/workflow";
import { WorkflowContext } from "../src/context";

function* myWorkflow(event: any): Program<any> {
  yield createActivityCall("my-activity", [event]);
  yield createActivityCall("my-activity", [event]);
}

const started1: WorkflowStarted = {
  type: WorkflowEventType.WorkflowStarted,
  workflowName: "workflowName",
  id: "1",
  input: `""`,
  timestamp: "",
  context: { name: "" },
};

const scheduled2: ActivityScheduled = {
  type: WorkflowEventType.ActivityScheduled,
  name: "my-activity",
  seq: 0,
  timestamp: "",
};

const scheduled4: ActivityScheduled = {
  type: WorkflowEventType.ActivityScheduled,
  name: "my-activity",
  seq: 1,
  timestamp: "",
};

const completed3: ActivityCompleted = {
  type: WorkflowEventType.ActivityCompleted,
  seq: 0,
  duration: 100,
  result: 10,
  timestamp: "",
};

const completed5: ActivityCompleted = {
  type: WorkflowEventType.ActivityCompleted,
  seq: 1,
  duration: 100,
  result: 10,
  timestamp: "",
};

const context: WorkflowContext = { name: "testWorkflow" };

test("history", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1],
    [],
    context,
    "executionId"
  );

  expect(history).toEqual([started1]);
});

test("start", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [],
    [started1],
    context,
    "executionId"
  );

  expect(history).toEqual([started1]);
});

test("start with tasks", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [],
    [started1, scheduled2, completed3],
    context,
    "executionId"
  );

  expect(history).toEqual([started1, scheduled2, completed3]);
});

test("start with history", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2],
    [completed3],
    context,
    "executionId"
  );

  expect(history).toEqual([started1, scheduled2, completed3]);
});

test("start with duplicate events", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2, completed3],
    [completed3],
    context,
    "executionId"
  );

  expect(history).toEqual([started1, scheduled2, completed3]);
});

test("start with generated events", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2, completed3, scheduled4],
    [completed3],
    context,
    "execId"
  );

  expect(history).toEqual([started1, scheduled2, completed3, scheduled4]);
});

test("start with duplicate", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2, completed3],
    [completed5, completed3],
    context,
    "execId"
  );

  expect(history).toEqual([started1, scheduled2, completed3, completed5]);
});

test("start with out of order", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2, completed3, completed5],
    [completed3],
    context,
    "execId"
  );
  expect(history).toEqual([started1, scheduled2, completed3, completed5]);
});

test("start with out of order", () => {
  const { history } = progressWorkflow(
    myWorkflow,
    [started1, scheduled2],
    [completed3, completed3, completed5, completed3, completed3, completed3],
    context,
    "execId"
  );
  expect(history).toEqual([started1, scheduled2, completed3, completed5]);
});
