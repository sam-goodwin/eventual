import { eventualRuntimeTestHarness } from "./runtime-test-harness.js";
import {
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
    "hello sam",
    "hello chris",
    "hello sam",
  ]);

  testCompletion("parent-child", parentWorkflow, "done");

  testCompletion("timeouts", timedOutWorkflow, {
    condition: true,
    signal: true,
  });
});
