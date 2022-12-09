import {
  activity,
  condition,
  asyncResult,
  sendSignal,
  Signal,
  sleepFor,
  sleepUntil,
  workflow,
  heartbeat,
  HeartbeatTimeout,
} from "@eventual/core";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { AsyncWriterTestEvent } from "./async-writer-handler.js";

const sqs = new SQSClient({});

const testQueueUrl = process.env.TEST_QUEUE_URL ?? "";

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});

const asyncActivity = activity(
  "asyncActivity",
  async (type: AsyncWriterTestEvent["type"]) => {
    return asyncResult<string>(async (token) => {
      console.log(testQueueUrl);
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: testQueueUrl,
          MessageBody: JSON.stringify({
            type,
            token,
          }),
        })
      );
    });
  }
);

const fail = activity("fail", async (value: string) => {
  throw new Error(value);
});

export const workflow1 = workflow(
  "my-workflow",
  async ({ name }: { name: string }) => {
    const result = await hello(name);
    return `you said ${result}`;
  }
);

export const workflow2 = workflow("my-parent-workflow", async () => {
  const result = await workflow1({ name: "sam" });
  return `user: ${result}`;
});

export const workflow3 = workflow("sleepy", async () => {
  await sleepFor(2);
  await sleepUntil(new Date(new Date().getTime() + 1000 * 2));
  return `done!`;
});

export const workflow4 = workflow("parallel", async () => {
  const greetings = Promise.all(["sam", "chris", "sam"].map(hello));
  const greetings2 = Promise.all(
    ["sam", "chris", "sam"].map(async (name) => {
      const greeting = await hello(name);
      return greeting.toUpperCase();
    })
  );
  const greetings3 = Promise.all([hello("sam"), hello("chris"), hello("sam")]);
  const any = Promise.any([fail("failed"), hello("sam")]);
  const race = Promise.race([
    fail("failed"),
    (async () => {
      await sleepFor(100);
      return await hello("sam");
    })(),
  ]);
  return Promise.allSettled([greetings, greetings2, greetings3, any, race]);
});

const signal = new Signal<number>("signal");
const doneSignal = new Signal("done");

/**
 * the parent workflow uses thr `expectSignal` function to block and wait for events from it's child workflow.
 */
export const parentWorkflow = workflow("parentWorkflow", async () => {
  const child = childWorkflow({ name: "child" });
  while (true) {
    const n = await signal.expect({ timeoutSeconds: 10 });

    console.log(n);

    if (n > 10) {
      child.signal(doneSignal);
      break;
    }

    child.signal(signal, n + 1);
  }

  // join with child
  await child;

  return "done";
});

/**
 * The child workflow shows a different way of having events using handlers, conditions, and local state.
 */
export const childWorkflow = workflow(
  "childWorkflow",
  async (input: { name: string }, { execution: { parentId } }) => {
    let block = false;
    let done = false;
    let last = 0;

    if (!parentId) {
      throw new Error("I need an adult");
    }

    console.log(`Hi, I am ${input.name}`);

    signal.on((n) => {
      last = n;
      block = false;
    });
    doneSignal.on(() => {
      done = true;
      block = false;
    });

    while (!done) {
      sendSignal(parentId, signal, last + 1);
      block = true;
      if (!(await condition({ timeoutSeconds: 10 }, () => !block))) {
        throw new Error("timed out!");
      }
    }

    return "done";
  }
);

const slowActivity = activity(
  "slowAct",
  { timeoutSeconds: 5 },
  () => new Promise((resolve) => setTimeout(resolve, 10 * 1000))
);

const slowWf = workflow("slowWorkflow", { timeoutSeconds: 5 }, () =>
  sleepFor(10)
);

export const timedOutWorkflow = workflow(
  "timedOut",
  { timeoutSeconds: 100 },
  async () => {
    // chains to be able to run in parallel.
    const timedOutFunctions = {
      condition: async () => {
        if (!(await condition({ timeoutSeconds: 2 }, () => false))) {
          throw new Error("Timed Out!");
        }
      },
      signal: async () => {
        await signal.expect({ timeoutSeconds: 2 });
      },
      activity: slowActivity,
      workflow: () => slowWf(undefined),
    };

    return <Record<keyof typeof timedOutFunctions, boolean>>Object.fromEntries(
      await Promise.all(
        Object.entries(timedOutFunctions).map(async ([name, func]) => {
          try {
            await func();
            return [name, false];
          } catch {
            return [name, true];
          }
        })
      )
    );
  }
);

export const asyncWorkflow = workflow(
  "asyncWorkflow",
  { timeoutSeconds: 100 }, // timeout eventually
  async () => {
    const result = await asyncActivity("complete");

    try {
      await asyncActivity("fail");
    } catch (err) {
      return [result, err];
    }
    throw new Error("I should not get here");
  }
);

const activityWithHeartbeat = activity(
  "activityWithHeartbeat",
  { heartbeatSeconds: 1 },
  async (n: number, type: "success" | "no-heartbeat" | "some-heartbeat") => {
    const delay = (s: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, s * 1000);
      });

    let _n = 0;
    while (_n++ < n) {
      await delay(0.5);
      if (type === "success") {
        await heartbeat();
      } else if (type === "some-heartbeat" && _n < 4) {
        await heartbeat();
      }
      // no-heartbeat never sends one... woops.
    }
    return n;
  }
);

export const heartbeatWorkflow = workflow(
  "heartbeatWorkflow",
  { timeoutSeconds: 100 }, // timeout eventually
  async (n: number) => {
    return await Promise.allSettled([
      activityWithHeartbeat(n, "success"),
      activityWithHeartbeat(n, "some-heartbeat"),
      (async () => {
        try {
          return await activityWithHeartbeat(n, "some-heartbeat");
        } catch (err) {
          if (err instanceof HeartbeatTimeout) {
            return "activity did not respond";
          }
          throw new Error("I should not get here");
        }
      })(),
      activityWithHeartbeat(n, "no-heartbeat"),
    ]);
  }
);
