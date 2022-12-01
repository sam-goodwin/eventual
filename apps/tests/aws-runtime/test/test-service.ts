import { createWorkflowClient } from "@eventual/aws-runtime";
import {
  activity,
  CompleteExecution,
  Execution,
  ExecutionStatus,
  Workflow,
  workflow,
  WorkflowInput,
  WorkflowOutput,
} from "@eventual/core";
import { queueUrl, tableName } from "./env.js";

const workflowClient = createWorkflowClient({
  tableName: tableName(),
  workflowQueueUrl: queueUrl(),
});

export interface Test<W extends Workflow = Workflow> {
  name: string;
  workflow: W;
  input?: WorkflowInput<W>;
  test: (executionId: string) => void | Promise<void>;
}

export const tests: Test[] = [];

function test(name: string, workflow: Workflow, test: Test["test"]): void;
function test<W extends Workflow = Workflow>(
  name: string,
  workflow: W,
  input: WorkflowInput<W>,
  test: Test["test"]
): void;
function test(
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
async function waitForWorkflowCompletion<W extends Workflow = Workflow>(
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

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function assertCompleteExecution(
  execution: Execution
): asserts execution is CompleteExecution {
  expect(execution.status).toEqual(ExecutionStatus.COMPLETE);
}

const workflow1 = workflow(
  "my-workflow",
  async ({ name }: { name: string }) => {
    const result = await hello(name);
    return `you said ${result}`;
  }
);

test("hello", workflow1, { name: "sam" }, async (executionId) => {
  const execution = await waitForWorkflowCompletion<typeof workflow1>(
    executionId
  );

  assertCompleteExecution(execution);

  expect(execution.result).toEqual("you said hello sam");
});

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});
