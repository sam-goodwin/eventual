import {
  TaskScheduled,
  TaskSucceeded,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowStarted,
} from "@eventual/core/internal";
import { filterEvents } from "../src/workflow-events.js";

import "../src/workflow";

const started1: WorkflowStarted = {
  type: WorkflowEventType.WorkflowStarted,
  workflowName: "workflowName",
  id: "1",
  input: `""`,
  timestamp: "",
  context: { name: "" },
};

const scheduled2: TaskScheduled = {
  type: WorkflowEventType.TaskScheduled,
  name: "my-task",
  seq: 0,
  timestamp: "",
};

const scheduled4: TaskScheduled = {
  type: WorkflowEventType.TaskScheduled,
  name: "my-task",
  seq: 1,
  timestamp: "",
};

const completed3: TaskSucceeded = {
  type: WorkflowEventType.TaskSucceeded,
  seq: 0,
  result: 10,
  timestamp: "",
};

const completed5: TaskSucceeded = {
  type: WorkflowEventType.TaskSucceeded,
  seq: 1,
  result: 10,
  timestamp: "",
};

test("history", () => {
  expect(filterEvents([started1], [])).toEqual([]);
});

test("start", () => {
  expect(filterEvents([], [started1])).toEqual([started1]);
});

test("start with tasks", () => {
  expect(filterEvents([], [started1, scheduled2, completed3])).toEqual([
    started1,
    scheduled2,
    completed3,
  ]);
});

test("start with history", () => {
  expect(
    filterEvents<WorkflowEvent>([started1, scheduled2], [completed3])
  ).toEqual([completed3]);
});

test("start with duplicate events", () => {
  expect(
    filterEvents<WorkflowEvent>(
      [started1, scheduled2, completed3],
      [completed3]
    )
  ).toEqual([]);
});

test("start with generated events", () => {
  expect(
    filterEvents<WorkflowEvent>(
      [started1, scheduled2, completed3, scheduled4],
      [completed3]
    )
  ).toEqual([]);
});

test("start with duplicate", () => {
  expect(
    filterEvents<WorkflowEvent>(
      [started1, scheduled2, completed3],
      [completed5, completed3]
    )
  ).toEqual([completed5]);
});

test("start with out of order", () => {
  expect(
    filterEvents<WorkflowEvent>(
      [started1, scheduled2, completed3, completed5],
      [completed5, completed3]
    )
  ).toEqual([]);
});

test("start with out of order", () => {
  expect(
    filterEvents<WorkflowEvent>(
      [started1, scheduled2],
      [completed3, completed3, completed5, completed3, completed3, completed3]
    )
  ).toEqual([completed3, completed5]);
});
