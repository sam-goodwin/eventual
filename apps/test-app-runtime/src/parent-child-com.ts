import { workflow, sendSignal, condition, signal } from "@eventual/core";

const mySignal = signal<number>("mySignal");
const doneSignal = signal("done");

/**
 * the parent workflow uses the `expectSignal` function to block and wait for events from it's child workflow.
 */
export const workflow1 = workflow("workflow1", async () => {
  const child = workflow2({ name: "child" });
  while (true) {
    const n = await mySignal.expectSignal();

    if (n > 10) {
      child.sendSignal(doneSignal);
      break;
    }

    child.sendSignal(mySignal, n + 1);
  }

  // join with child
  await child;

  return "done";
});

/**
 * The child workflow shows a different way of having events using handlers, conditions, and local state.
 */
export const workflow2 = workflow(
  "workflow2",
  async (_input: { name: string }, { execution: { parentId } }) => {
    let block = false;
    let done = false;
    let last = 0;

    if (!parentId) {
      throw new Error("I need an adult");
    }

    mySignal.onSignal((n) => {
      last = n;
      block = false;
    });
    doneSignal.onSignal(() => {
      done = true;
      block = false;
    });

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!done) {
      sendSignal(parentId, mySignal, last + 1);
      block = true;
      await condition(() => !block);
    }

    return "done";
  }
);
