import { AWSHttpEventualClient } from "@eventual/aws-client";

const workflowClient = new AWSHttpEventualClient({
  serviceUrl: process.env.EVENTUAL_SERVICE_URL ?? "",
});

export async function handle(input: { name: string; executions: number }) {
  await Promise.all(
    Array.from(Array(input.executions)).map(async (_, i) => {
      workflowClient.startExecution({
        workflow: "bench",
        input: undefined,
        executionName: `${input.name}-${i}`,
      });
    })
  );
}
