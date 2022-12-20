import { sleepFor, workflow } from "@eventual/core";

export const workflow1 = workflow("workflow1", async () => {
  return "hi";
});

export const workflow2 = workflow("workflow2", async () => {
  await sleepFor(10);
});
