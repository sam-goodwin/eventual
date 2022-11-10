import type lambda from "aws-lambda";

/**
 * Creates an entrypoint function for orchestrating a workflow.
 */
export async function orchestrator(
  program: (input: any) => Generator<any, any, any>
) {
  return async (event: lambda.SQSEvent) => {
    // TODO
  };
}
