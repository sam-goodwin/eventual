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

export function sampleCDKStack(projectName: string) {
  return `import { Construct } from "constructs";
import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Service } from "@eventual/aws-cdk";
import path from "path";

export interface MyServiceStackProps extends StackProps {}

export class MyServiceStack extends Stack {
  public readonly service: Service;

  constructor(scope: Construct, id: string, props?: MyServiceStackProps) {
    super(scope, id, props);

    this.service = new Service(this, "${projectName}", {
      name: "${projectName}",
      entry: path.join(__dirname, "..", "..", "services", "src", "index.ts")
    });

    new CfnOutput(this, "my-service-api-endpoint", {
      exportName: "my-service-api-endpoint",
      value: this.service.api.gateway.url!,
    });

    new CfnOutput(this, "my-service-event-bus-arn", {
      exportName: "my-service-api-endpoint",
      value: this.service.events.bus.eventBusArn,
    });
  }
}
`;
}
