import { eventualRuntimeTestHarness } from "./runtime-test-harness.js";
import {
  eventDrivenWorkflow,
  parentWorkflow,
  timedOutWorkflow,
  workflow1,
  workflow2,
  workflow3,
  workflow4,
} from "./test-service.js";

jest.setTimeout(100 * 1000);

eventualRuntimeTestHarness(({ testCompletion }) => {
  testCompletion(
    "call activity",
    workflow1,
    { name: "sam" },
    "you said hello sam"
  );

  testCompletion("call workflow", workflow2, "user: you said hello sam");

  testCompletion("sleep", workflow3, "done!");

  testCompletion("parallel", workflow4, [
    { status: "fulfilled", value: ["hello sam", "hello chris", "hello sam"] },
    { status: "fulfilled", value: ["HELLO SAM", "HELLO CHRIS", "HELLO SAM"] },
    { status: "fulfilled", value: ["hello sam", "hello chris", "hello sam"] },
    { status: "fulfilled", value: "hello sam" },
    { status: "rejected", reason: "Error" },
  ]);

  testCompletion("parent-child", parentWorkflow, "done");

  testCompletion("timeouts", timedOutWorkflow, {
    condition: true,
    signal: true,
    activity: true,
    workflow: true,
  });

  testCompletion("event-driven", eventDrivenWorkflow, "done!");
});
