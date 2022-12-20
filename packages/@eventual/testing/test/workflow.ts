import { activity, sleepFor, workflow } from "@eventual/core";

export const workflow1 = workflow("workflow1", async () => {
  return "hi";
});

export const workflow2 = workflow("workflow2", async () => {
  await sleepFor(10);
});

export const activity1 = activity("", async () => "hi");

export const workflow3 = workflow("workflow3", async () => {
  await activity1();
});
