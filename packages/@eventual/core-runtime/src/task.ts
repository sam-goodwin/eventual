import { TaskHandler } from "@eventual/core";
import { TaskRuntimeContext } from "@eventual/core/internal";
import { AsyncLocalStorage } from "async_hooks";

declare module "@eventual/core" {
  export interface Task<Name, Input, Output> {
    definition: TaskHandler<Input, Output>;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var eventualTaskContextStore: AsyncLocalStorage<TaskRuntimeContext>;
}

if (!globalThis.eventualTaskContextStore) {
  // override the getEventualCallHook to return from the AsyncLocalStore.
  globalThis.getEventualTaskRuntimeContext = () => {
    const context = globalThis.eventualTaskContextStore.getStore();
    if (!context) {
      throw new Error("Eventual task context has not been registered yet.");
    }
    return context;
  };

  globalThis.eventualTaskContextStore =
    new AsyncLocalStorage<TaskRuntimeContext>();
}

export async function taskContextScope<Output>(
  context: TaskRuntimeContext,
  handler: () => Output
): Promise<Awaited<Output>> {
  if (!globalThis.eventualTaskContextStore) {
    globalThis.eventualTaskContextStore =
      new AsyncLocalStorage<TaskRuntimeContext>();
  }
  return await globalThis.eventualTaskContextStore.run(context, async () => {
    return await handler();
  });
}
