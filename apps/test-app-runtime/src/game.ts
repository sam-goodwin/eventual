import { workflow, WorkflowHandler, Event, EventPayload } from "@eventual/core";

declare function condition(
  predicate: () => boolean,
  opts?: { timeoutSeconds: number }
): Promise<void>;

const event = new Event<number>("event");
const doneEvent = new Event("done");

declare module "@eventual/core" {
  interface Workflow<F extends WorkflowHandler = WorkflowHandler> {
    ref(executionId: string): ExecutionRef;
    startExecution(input: Parameters<F>[0]): Promise<ExecutionRef>;
  }

  interface ExecutionRef {
    send<E extends Event<any>>(event: E, payload: EventPayload<E>): void;
  }
}

/**
 * the parent workflow uses thr `waitForEvent` function to block and wait for events from it's child workflow.
 */
export const workflow1 = workflow("workflow1", async () => {
  const child = await workflow2.startExecution({ name: "child" });
  while (true) {
    const n = await event.waitFor();

    console.log(n);

    if (n > 10) {
      child.send(doneEvent, undefined);
      break;
    }

    child.send(event, n + 1);
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

    await event.on((n) => {
      last = n;
      block = false;
    });
    await doneEvent.on(() => {
      done = true;
      block = false;
    });

    while (!done) {
      parent.send(event, last + 1);
      block = true;
      await condition(() => !block);
    }

    return "done";
  }
);
