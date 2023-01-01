import { event, activity, workflow, api } from "@eventual/core";

api.post("/work", async (request) => {
  const items: string[] = await request.json();

  const { executionId } = await myWorkflow.startExecution({
    input: items,
  });

  return new Response(JSON.stringify({ executionId }), {
    status: 200,
  });
});

export const myWorkflow = workflow("myWorkflow", async (items: string[]) => {
  const results = await Promise.all(items.map(doWork));

  await workDone.publishEvents({
    outputs: results,
  });

  return results;
});

export const doWork = activity("work", async (work: string) => {
  console.log("Doing Work", work);

  return work.length;
});

export interface WorkDoneEvent {
  outputs: number[];
}

export const workDone = event<WorkDoneEvent>("WorkDone");
