import {
  activity,
  event,
  sendSignal,
  signal,
  sleepFor,
  sleepUntil,
  workflow,
} from "@eventual/core";

export const workflow1 = workflow("workflow1", async () => {
  return "hi";
});

export const errorWorkflow = workflow("errorWorkflow", async () => {
  throw new Error("failed!");
});

export const sleepWorkflow = workflow(
  "sleepWorkflow",
  async (relative: boolean) => {
    if (relative) {
      await sleepFor(10);
    } else {
      await sleepUntil("2022-01-02T12:00:00Z");
    }
    return "hello";
  }
);

export const activity1 = activity("act1", async () => "hi");

/**
 * Runs activities in parallel and in series based on the parameters.
 *
 * ex: p: 1, s: 1 => [["activity result"]]
 * ex: p: 2, s: 1 => [["activity result","activity result"]]
 * ex: p: 1, s: 2 => [["activity result"],["activity result"]]
 * ex: p: 2, s: 2 => [["activity result","activity result"],["activity result","activity result"]]
 */
export const workflow3 = workflow(
  "workflow3",
  async ({
    parallel = 1,
    series = 1,
  }: {
    parallel?: number;
    series?: number;
  } = {}) => {
    const result: PromiseSettledResult<string>[][] = [];
    do {
      const r = await Promise.allSettled(
        [...Array(parallel).keys()].map(() => activity1())
      );
      result.push(r);
    } while (--series > 0);

    return result;
  }
);

export const continueSignal = signal("continue");
export const dataSignal = signal<string>("data");
export const dataDoneSignal = signal("dataDone");

/**
 * Events which proxy to the {@link signalWorkflow}
 */
export const continueEvent = event<{ executionId: string }>("continue");
export const dataEvent = event<{ data: string; executionId: string }>("data");
export const dataDoneEvent = event<{ executionId: string }>("dataDone");

export const signalWorkflow = workflow("signalFlow", async () => {
  let data = "done!";
  const dataSignalHandle = dataSignal.on((d) => {
    data = d;
  });
  dataDoneSignal.on(() => {
    dataSignalHandle.dispose();
  });
  await continueSignal.expect();
  return data;
});

export const orchestrate = workflow(
  "orchestrate",
  async ({
    targetExecutionId,
    events = false,
  }: {
    targetExecutionId: string;
    events?: boolean;
  }) => {
    if (!events) {
      await sendSignal(
        targetExecutionId,
        dataSignal,
        "hello from the orchestrator workflow!"
      );
      await sendSignal(targetExecutionId, dataDoneSignal);
      await sendSignal(targetExecutionId, continueSignal);
    } else {
      // the events parameter sends events instead of signals
      // event handlers turn them into signals.
      await dataEvent.publish({
        data: "hello from the orchestrator workflow!",
        executionId: targetExecutionId,
      });
      await dataDoneEvent.publish({ executionId: targetExecutionId });
      await continueEvent.publish({ executionId: targetExecutionId });
    }
    return "nothing to see here";
  }
);

continueEvent.on(async ({ executionId }) => {
  await sendSignal(executionId, continueSignal);
});

dataEvent.on(async ({ executionId, data }) => {
  await sendSignal(executionId, dataSignal, data);
});

dataDoneEvent.on(async ({ executionId }) => {
  await sendSignal(executionId, dataDoneSignal);
});
