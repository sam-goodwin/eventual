import {
  activity,
  condition,
  sendSignal,
  Signal,
  sleepFor,
  sleepUntil,
  workflow,
} from "@eventual/core";

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
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
  return Promise.all([greetings, greetings2, greetings3]);
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

export const timedOutWorkflow = workflow<undefined, Record<string, boolean>>(
  "timedOut",
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
    };

    return Object.fromEntries(
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
