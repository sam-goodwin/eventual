import { workflow, Signal, SignalPayload } from "@eventual/core";

declare function condition(
  predicate: () => boolean,
  opts?: { timeoutSeconds: number }
): Promise<void>;

const signal = new Signal<number>("event");
const doneSignal = new Signal("done");

declare module "@eventual/core" {
  interface Workflow<Input = any, Output = any> {
    ref(executionId: string): ExecutionRef;
    startExecution(input: Input): Promise<ExecutionRef>;
  }

  interface ExecutionRef {
    send<E extends Signal<any>>(event: E, payload: SignalPayload<E>): void;
  }
}

/**
 * the parent workflow uses thr `waitForSignal` function to block and wait for events from it's child workflow.
 */
export const workflow1 = workflow("workflow1", async () => {
  const child = await workflow2.startExecution({ name: "child" });
  while (true) {
    const n = await signal.waitFor();

    console.log(n);

    if (n > 10) {
      child.send(doneSignal, undefined);
      break;
    }

    child.send(signal, n + 1);
  }

  return "done";
});

/**
 * The child workflow shows a different way of having events using handlers, conditions, and local state.
 */
export const workflow2 = workflow(
  "workflow2",
  async (input: { name: string }, { execution: { parentId } }) => {
    let block = false;
    let done = false;
    let last = 0;

    if (!parentId) {
      throw new Error("I need an adult");
    }

    console.log(`Hi, I am ${input.name}`);
    const parent = workflow1.ref(parentId);

    signal.on((n) => {
      last = n;
      block = false;
    });
    doneSignal.on(() => {
      done = true;
      block = false;
    });

    while (!done) {
      parent.send(signal, last + 1);
      block = true;
      await condition(() => !block);
    }

    return "done";
  }
);
