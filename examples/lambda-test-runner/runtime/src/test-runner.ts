import { activity, workflow } from "@eventual/core";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import equal from "fast-deep-equal";

const lambda = new LambdaClient({});

export interface TestRunnerRequest {
  testCases: TestCase[];
  target: Target;
  /**
   * @default 10
   */
  maxConcurrency?: number;
}

export interface Target {
  type: "lambda";
  name: string;
}

export interface TestCase {
  input: any;
  expected: string;
}

export type TestCaseResult = TestCaseResultComplete | TestCaseResultError;

export interface TestCaseResultComplete {
  status: "pass" | "fail";
  expected: any;
  actual: any;
}
export interface TestCaseResultError {
  status: "error";
  error: string;
}

export const testRunner = workflow(
  "test-runner",
  async (request: TestRunnerRequest) => {
    const caseBatches = partition(
      request.maxConcurrency ?? 10,
      request.testCases
    );

    const results = [];

    for (const batch of caseBatches) {
      results.push(
        ...(await Promise.all(
          batch.map(async (testCase) => {
            let result: Awaited<ReturnType<typeof runTestCase>>;
            try {
              result = await runTestCase(request.target, testCase.input);
            } catch (err) {
              return { status: "error", error: (err as Error).name };
            }
            if ("error" in result) {
              return { status: "error", error: result.error! };
            } else {
              const isEqual = equal(testCase.expected, result.result);

              return {
                status: isEqual ? "pass" : "fail",
                actual: result.result,
                expected: testCase.expected,
              };
            }
          })
        ))
      );
    }

    return {
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      errored: results.filter((r) => r.status === "error").length,
      results,
    };
  }
);

const runTestCase = activity(
  "runTestCase",
  async (target: Target, input: any) => {
    const result = await lambda.send(
      new InvokeCommand({
        FunctionName: target.name,
        Payload: Buffer.from(JSON.stringify(input)),
      })
    );

    return result.FunctionError
      ? { error: result.FunctionError }
      : {
          result: result.Payload
            ? JSON.parse(Buffer.from(result.Payload).toString("utf-8"))
            : undefined,
        };
  }
);

function partition<T>(batchSize: number, items: T[]): T[][] {
  return items.reduceRight(([current, ...batches]: T[][], item) => {
    if (!current) {
      return [[item], ...(batches ?? [])];
    } else if (current?.length < batchSize) {
      return [[item, ...current], ...(batches ?? [])];
    } else {
      return [[item], current, ...(batches ?? [])];
    }
  }, []);
}
