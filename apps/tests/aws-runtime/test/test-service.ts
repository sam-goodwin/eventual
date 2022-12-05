import {
  activity,
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
  return Promise.all([hello("sam"), hello("chris"), hello("sam")]);
});

const signal = new Signal<number>("signal");
const childSignal = new Signal<{ done: boolean } | { n: number }>("done");

/**
 * the parent workflow uses thr `expectSignal` function to block and wait for events from it's child workflow.
 */
export const parentWorkflow = workflow("parentWorkflow", async () => {
  const child = childWorkflow({ name: "child" });
  while (true) {
    const n = await signal.expect();

    console.log(n);

    if (n > 10) {
      child.signal(childSignal, { done: true });
      break;
    }

    child.signal(childSignal, { n: n + 1 });
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
    // let block = false;
    let done = false;
    let last = 0;

    if (!parentId) {
      throw new Error("I need an adult");
    }

    console.log(`Hi, I am ${input.name}`);

    childSignal.on((input) => {
      if ("n" in input) {
        last = input.n;
      } else {
        done = input.done;
      }
      // block = false;
    });

    while (!done) {
      sendSignal(parentId, signal, last + 1);
      // block = true;
      await childSignal.expect();
      // TODO: support conditions
      // await condition(() => !block);
    }

    return "done";
  }
);
