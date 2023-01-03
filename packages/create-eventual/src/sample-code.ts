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

export const sampleSSTCode = `import { StackContext } from "@serverless-stack/resources";
import { Service } from "@eventual/aws-cdk";
import path from "path";

export function MyStack({ stack }: StackContext) {
  const service = new Service(stack, "Service", {
    // this path is relative to .build/ where SST puts the CDK bundle
    entry: path.resolve(__dirname, "..", ".., "services", "functions", "service.ts"),
    name: "my-service",
  });
  stack.addOutputs({
    ApiEndpoint: service.api.gateway.url!,
  });
}
`;

export const sampleCDKApp = `import { App, Stack } from "aws-cdk-lib";
import path from "path";
import { MyStack } from "./my-stack";

const app = new App();

new MyStack(app, "my-stack");
`;

export const sampleCDKStack = `import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { Service } from "@eventual/aws-cdk";
import path from "path";

export interface MyStackProps extends StackProps {}

export class MyStack extends Stack {
  public readonly service: Service;

  constructor(scope: Construct, id: string, props?: MyStackProps) {
    super(scope, id, props);

    this.service = new Service(this, "Service", {
      name: "my-service",
      entry: path.join(__dirname, "..", "services", "src", "my-service.ts")
    });
  }
}
`;
