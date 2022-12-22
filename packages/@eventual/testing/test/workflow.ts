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

export const workflow3 = workflow("workflow3", async () => {
  return await activity1();
});
