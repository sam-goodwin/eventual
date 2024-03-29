import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  asyncResult,
  condition,
  duration,
  event,
  sendSignal,
  signal,
  task,
  time,
  workflow,
} from "@eventual/core";

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
      await duration(10);
    } else {
      await time("2022-01-02T12:00:00Z");
    }
    return "hello";
  }
);

export const task1 = task("task1", async () => "hi");

/**
 * Runs tasks in parallel and in series based on the parameters.
 *
 * ex: p: 1, s: 1 => [["task result"]]
 * ex: p: 2, s: 1 => [["task result","task result"]]
 * ex: p: 1, s: 2 => [["task result"],["task result"]]
 * ex: p: 2, s: 2 => [["task result","task result"],["task result","task result"]]
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
        [...Array(parallel).keys()].map(() => task1())
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
  const dataSignalHandle = dataSignal.onSignal((d) => {
    data = d;
  });
  dataDoneSignal.onSignal(() => {
    dataSignalHandle.dispose();
  });
  await continueSignal.expectSignal();
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
      await dataEvent.emit({
        data: "hello from the orchestrator workflow!",
        executionId: targetExecutionId,
      });
      await dataDoneEvent.emit({ executionId: targetExecutionId });
      await continueEvent.emit({ executionId: targetExecutionId });
    }
    return "nothing to see here";
  }
);

continueEvent.onEvent("onContinueEvent", async ({ executionId }) => {
  await sendSignal(executionId, continueSignal);
});

dataEvent.onEvent("onDataEvent", async ({ executionId, data }) => {
  await sendSignal(executionId, dataSignal, data);
});

dataDoneEvent.onEvent("onDataDoneEvent", async ({ executionId }) => {
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
    await duration(1);
    await execution.sendSignal(dataSignal, "hello from a workflow");
    await execution.sendSignal(dataDoneSignal);
    await execution.sendSignal(continueSignal);

    return await execution;
  }
);

export const actWithTimeout = task(
  "actWithTimeout",
  { timeout: duration(30, "seconds") },
  async () => {
    return "hi";
  }
);

export const workflow2WithTimeouts = workflow(
  "wf2",
  { timeout: duration(50, "seconds") },
  async () => actWithTimeout()
);
export const workflowWithTimeouts = workflow(
  "wf1",
  { timeout: duration(100, "seconds") },
  async () => {
    return Promise.allSettled([
      actWithTimeout(),
      workflow2WithTimeouts(undefined),
      dataSignal.expectSignal({ timeout: duration(30, "seconds") }),
    ]);
  }
);

export const longRunningTask = task("longRunningAct", async () => {
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
 * Start a "long running task", return the first to return,
 * a hour sleep or the task.
 */
export const longRunningWorkflow = workflow("longRunningWf", async () => {
  const t = longRunningTask();

  const result = Promise.race([
    t,
    (async () => {
      await duration(60 * 60);
      return "sleep";
    })(),
  ]);

  return await result;
});

/**
 * Record signals received, only after a given date.
 */
export const timedWorkflow = workflow(
  "timedWorkflow",
  async (input: { startDate: string }) => {
    let n = 0;
    let total = 0;
    dataSignal.onSignal(() => {
      total++;
      console.log(new Date());
      if (new Date().getTime() >= new Date(input.startDate).getTime()) {
        n++;
      }
    });

    await condition(() => n >= 10);

    return { seen: total, n };
  }
);

/**
 * Record the dates of signals until we get 2.
 */
export const timeWorkflow = workflow("timeWorkflow", async () => {
  const dates = [new Date().toISOString()];

  dataSignal.onSignal(() => {
    dates.push(new Date().toISOString());
  });

  await condition(() => dates.length === 3);

  return { dates };
});
