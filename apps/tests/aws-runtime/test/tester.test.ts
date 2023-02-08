// @ts-nocheck

import { jest } from "@jest/globals";

import { EventualError, HeartbeatTimeout } from "@eventual/core";
import { ChaosEffects, ChaosTargets } from "./chaos-extension/chaos-engine.js";
import { serviceUrl } from "./env.js";
import { eventualRuntimeTestHarness } from "./runtime-test-harness.js";
import {
  eventDrivenWorkflow,
  asyncWorkflow,
  heartbeatWorkflow,
  parentWorkflow,
  timedOutWorkflow,
  workflow1,
  workflow2,
  workflow3,
  workflow4,
  failedWorkflow,
  timedWorkflow,
  allCommands,
} from "./test-service.js";

import fetch from "node-fetch";

jest.setTimeout(100 * 1000);

eventualRuntimeTestHarness(
  ({ testCompletion, testFailed }) => {
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
      {
        status: "rejected",
        reason: new EventualError("Error", "failed").toJSON(),
      },
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
      new EventualError(
        "AsyncWriterError",
        "I was told to fail this activity, sorry."
      ).toJSON(),
    ]);

    testCompletion("heartbeat", heartbeatWorkflow, 20, [
      { status: "fulfilled", value: 20 },
      {
        status: "rejected",
        reason: new HeartbeatTimeout("Activity Heartbeat TimedOut").toJSON(),
      },
      { status: "fulfilled", value: "activity did not respond" },
      {
        status: "rejected",
        reason: new HeartbeatTimeout("Activity Heartbeat TimedOut").toJSON(),
      },
    ]);

    testCompletion("event-driven", eventDrivenWorkflow, "done!");

    testFailed(
      "catch thrown error",
      failedWorkflow,
      true,
      "MyError",
      "I am useless"
    );
    testFailed(
      "catch thrown value",
      failedWorkflow,
      false,
      "Error",
      `"I am useless"`
    );

    testCompletion("datetime", timedWorkflow, (r) => {
      expect(r.dates).toHaveLength(6);
      expect([...new Set(r.dates)]).toHaveLength(6);
    });
  },
  {
    name: "s3 persist failures",
    chaos: {
      rules: [
        {
          targets: [ChaosTargets.command("PutObjectCommand", "S3Client")],
          effect: ChaosEffects.reject(),
        },
      ],
      durationMillis: 4000,
    },
    register: ({ testCompletion }) => {
      testCompletion(
        "call activity",
        workflow1,
        { name: "sam" },
        "you said hello sam"
      );

      testCompletion("test commands", allCommands, {
        signalCount: 1,
      });
    },
  }
);

const url = serviceUrl();

test("hello API should route and return OK response", async () => {
  const response = await (await fetch(`${url}/hello`)).text();

  expect(response).toEqual("hello world");
});

test("params with schema should parse", async () => {
  const response = await (await fetch(`${url}/user/typed1/my-user-id`)).json();

  expect(response).toEqual({
    userId: "my-user-id",
    createdTime: new Date(0).toISOString(),
  });
});

test("output with schema should serialize", async () => {
  const response = await (await fetch(`${url}/user/typed2/my-user-id`)).json();

  expect(response).toEqual({
    userId: "my-user-id",
    createdTime: new Date(0).toISOString(),
  });
});
