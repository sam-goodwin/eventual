Eventual is a TypeScript framework for building event-driven applications on AWS using Commands, Events, Subscribers, Workflows and Streams.

Your application exports APIs, Workflows, etc. that are then imported to synthesize an AWS CDK or SST v2 stack that is then deployed to AWS.

```ts
import { event, task, workflow, api, HttpResponse } from "@eventual/core";

api.post("/work", async (request) => {
  const items: string[] = await request.json();

  const { executionId } = await myWorkflow.startExecution({
    input: items,
  });

  return new HttpResponse(JSON.stringify({ executionId }), {
    status: 200,
  });
});

export const myWorkflow = workflow("myWorkflow", async (items: string[]) => {
  const results = await Promise.all(items.map(doWork));

  await workDone.emit({
    outputs: results,
  });

  return results;
});

export const doWork = task("work", async (work: string) => {
  console.log("Doing Work", work);

  return work.length;
});

export interface WorkDoneEvent {
  outputs: number[];
}

export const workDone = event<WorkDoneEvent>("WorkDone");
```
