import {
  activity,
  asyncResult,
  event,
  sendSignal,
  signal,
  sleepFor,
  sleepUntil,
  workflow,
} from "@eventual/core";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});

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

export const throwWorkflow = workflow("throwWorkflow", async () => {
  throw new Error("Ahh");
});

export const orchestrateWorkflow = workflow(
  "orchestrateWorkflow",
  async (thr = false) => {
    if (thr) {
      await throwWorkflow(undefined);
    }
    const execution = signalWorkflow(undefined);
    await sleepFor(1);
    await execution.signal(dataSignal, "hello from a workflow");
    await execution.signal(dataDoneSignal);
    await execution.signal(continueSignal);

    return await execution;
  }
);

export const actWithTimeout = activity(
  "actWithTimeout",
  { timeoutSeconds: 30 },
  async () => {
    return "hi";
  }
);

export const workflow2WithTimeouts = workflow(
  "wf2",
  { timeoutSeconds: 50 },
  async () => actWithTimeout()
);
export const workflowWithTimeouts = workflow(
  "wf1",
  { timeoutSeconds: 100 },
  async () => {
    return Promise.allSettled([
      actWithTimeout(),
      workflow2WithTimeouts(undefined),
      dataSignal.expect({ timeoutSeconds: 30 }),
    ]);
  }
);

export const longRunningAct = activity("longRunningAct", async () => {
  return asyncResult<{ value: string }>(async (token) => {
    await sqs.send(
      new SendMessageCommand({
        MessageBody: token,
        QueueUrl: "fake queue",
      })
    );
  });
});

/**
 * Start a "long running activity", return the first to return,
 * a hour sleep or the activity.
 */
export const longRunningWorkflow = workflow("longRunningWf", async () => {
  const act = longRunningAct();

  const result = Promise.race([
    act,
    (async () => {
      await sleepFor(60 * 60);
      return "sleep";
    })(),
  ]);

  return await result;
});
