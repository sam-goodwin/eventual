export const sampleCode = `
import { event, activity, workflow, sleepFor } from "@eventual/core";

export const myWorkflow = workflow("myWorkflow", async (items: string[]) => {
  const results = await Promise.all(
    items.map(async (item) => {
      await sleepFor(10);

      const output = await doWork(item);

      await workDone.publish({
        input: item,
        output,
      });

      return output;
    })
  );

  return results;
});

export const doWork = activity("work", async (work: string) => {
  console.log("Doing Work", work);
  return work.length;
});

export const workDone = event<{
  input: string;
  output: number;
}>("WorkDone");
`;
