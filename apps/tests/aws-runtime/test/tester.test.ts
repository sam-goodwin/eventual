import { HeartbeatTimeout } from "@eventual/core";
import {
  eventualError,
  eventualRuntimeTestHarness,
} from "./runtime-test-harness.js";
import {
  asyncWorkflow,
  heartbeatWorkflow,
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

  testCompletion("asyncActivities", asyncWorkflow, [
    "hello from the async writer!",
    "AsyncWriterError",
  ]);

  testCompletion("heartbeat", heartbeatWorkflow, 10, [
    { status: "fulfilled", value: 10 },
    {
      status: "rejected",
      reason: eventualError(
        new HeartbeatTimeout("Activity Heartbeat TimedOut")
      ),
    },
    { status: "fulfilled", value: "activity did not respond" },
    {
      status: "rejected",
      reason: eventualError(
        new HeartbeatTimeout("Activity Heartbeat TimedOut")
      ),
    },
  ]);
});
