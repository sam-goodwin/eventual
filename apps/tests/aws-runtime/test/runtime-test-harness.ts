import {
  CompleteExecution,
  Execution,
  ExecutionStatus,
  Workflow,
  WorkflowInput,
  WorkflowOutput,
} from "@eventual/core";
import { workflowClient } from "./client-create.js";

export interface Test<W extends Workflow = Workflow> {
  name: string;
  workflow: W;
  input?: WorkflowInput<W>;
  test: (executionId: string) => void | Promise<void>;
}

export const tests: Test[] = [];

export function test(
  name: string,
  workflow: Workflow,
  test: Test["test"]
): void;
export function test<W extends Workflow = Workflow>(
  name: string,
  workflow: W,
  input: WorkflowInput<W>,
  test: Test["test"]
): void;
export function test(
  name: string,
  workflow: Workflow,
  inputOrTest: any | Test["test"],
  maybeTest?: Test["test"]
): void {
  const [input, test] =
    typeof inputOrTest === "function"
      ? [undefined, inputOrTest]
      : [inputOrTest, maybeTest];
  tests.push({
    name,
    workflow,
    input,
    test,
  });
}

// TODO delay and backoff
export async function waitForWorkflowCompletion<W extends Workflow = Workflow>(
  executionId: string
): Promise<Execution<WorkflowOutput<W>>> {
  let execution: Execution | undefined;
  do {
    execution = await workflowClient.getExecution(executionId);
    if (!execution) {
      throw new Error("Cannot find execution id: " + executionId);
    }
    console.log(execution);
    await delay(1000);
  } while (execution.status === ExecutionStatus.IN_PROGRESS);

  return execution;
}

export async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function assertCompleteExecution(
  execution: Execution
): asserts execution is CompleteExecution {
  expect(execution.status).toEqual(ExecutionStatus.COMPLETE);
}
