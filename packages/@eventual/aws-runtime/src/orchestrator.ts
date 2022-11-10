import type lambda from "aws-lambda";

/**
 * Creates an entrypoint function for orchestrating a workflow.
 */
export async function orchestrator(
  _program: (input: any) => Generator<any, any, any>
) {
  return async (_event: lambda.SQSEvent) => {
    // TODO
  };
}
