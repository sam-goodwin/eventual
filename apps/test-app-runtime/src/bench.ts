import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const startWorkflowARN = process.env.FUNCTION_ARN;

const lambda = new LambdaClient({});

export async function handle(input: { name: string; executions: number }) {
  await Promise.all(
    Array.from(Array(input.executions)).map(async (_, i) => {
      await lambda.send(
        new InvokeCommand({
          FunctionName: startWorkflowARN,
          InvocationType: "Event",
          Payload: Buffer.from(
            JSON.stringify({
              name: `${input.name}-${i}`,
              input: {},
            }),
            "utf-8"
          ),
        })
      );
    })
  );
}
