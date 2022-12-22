import { activity, sleepFor, sleepUntil, workflow } from "@eventual/core";

export const workflow1 = workflow("workflow1", async () => {
  return "hi";
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
