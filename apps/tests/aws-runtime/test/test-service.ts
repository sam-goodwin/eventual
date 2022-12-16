import {
  activity,
  condition,
  event,
  expectSignal,
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
  const race = Promise.race([fail("failed"), sayHelloInSeconds(100)]);
  return Promise.allSettled([greetings, greetings2, greetings3, any, race]);

  async function sayHelloInSeconds(seconds: number) {
    await sleepFor(seconds);
    return await hello("sam");
  }
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
  { heartbeatSeconds: 2 },
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
      } else if (type === "some-heartbeat" && _n < n * 0.33) {
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

/**
 * A workflow test that tests the {@link event} intrinsic.
 *
 * A subscription to {@link signalEvent} is set up to forward events
 * as signals to the workflow execution.
 *
 * First, this workflow publishes an event to the {@link signalEvent}
 * with a signalId of "start" and then waits for that signal to wake
 * this workflow.
 *
 * Then, the {@link sendFinishEvent} activity is invoked which sends
 * an event to {@link signalEvent} with signalId of "finish". The workflow
 * waits for this signal to wake it before returning "done!".
 *
 * The final "finish" event is sent to the {@link signalEvent} with a
 * property of `proxy: true` which instructs the handler to send the event
 * back through the {@link signalEvent} handler before sending the signal
 * to the execution.
 *
 * This tests the publishes of events from:
 * 1. workflows
 * 2. activities.
 * 3. event handlers
 *
 * TODO: add a test for api handlers.
 */
export const eventDrivenWorkflow = workflow(
  "eventDrivenWorkflow",
  async (_, ctx) => {
    // publish an event from a workflow (the orchestrator)
    await signalEvent.publish({
      executionId: ctx.execution.id,
      signalId: "start",
    });

    // wait for the event to come back around and wake this workflow
    const { value } = await expectSignal("start", {
      timeoutSeconds: 30,
    });

    await sendFinishEvent(ctx.execution.id);

    await expectSignal("finish", {
      timeoutSeconds: 30,
    });

    return value;
  }
);

const signalEvent = event<{
  executionId: string;
  signalId: string;
  proxy?: true;
}>("SignalEvent");

signalEvent.on(async ({ executionId, signalId, proxy }) => {
  console.debug("received signal event", { executionId, signalId, proxy });
  if (proxy) {
    // if configured to proxy, re-route this event through the signalEvent
    // reason: to test that we can publish events from within an event handler
    await signalEvent.publish({
      executionId,
      signalId,
    });
  } else {
    // otherwise, send the signal to the workflow
    await sendSignal(executionId, signalId, { value: "done!" });
  }
});

const sendFinishEvent = activity("sendFinish", async (executionId: string) => {
  // publish an event from an activity
  await signalEvent.publish({
    executionId,
    signalId: "finish",
    // set proxy to true so that this event will route through event bridge again
    // to test that we can publish events from event handlers
    proxy: true,
  });
});
