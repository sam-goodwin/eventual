export const sampleServiceCode = `import { event, activity, workflow, api } from "@eventual/core";

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
`;

export function sampleSSTCode(projectName: string) {
  return `import { StackContext } from "@serverless-stack/resources";
import { Service } from "@eventual/aws-cdk";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export function MyStack({ stack }: StackContext) {
  const service = new Service(stack, "Service", {
    // this path is relative to .build/ where SST puts the CDK bundle
    entry: path.resolve(__dirname, "..", "..", "services", "functions", "service.ts"),
    name: "${projectName}",
  });
  stack.addOutputs({
    ServiceApiEndpoint: service.api.gateway.url!,
    ServiceEventBusArn: service.events.bus.eventBusArn
  });
}
`;
}

export function sampleCDKApp(projectName: string) {
  return `import { App } from "aws-cdk-lib";
import { MyServiceStack } from "./${projectName}-stack";

const app = new App();

new MyServiceStack(app, "${projectName}");
`;
}
