import {
  CompleteExecution,
  Execution,
  ExecutionStatus,
  FailedExecution,
  Workflow,
  WorkflowInput,
  WorkflowOutput,
} from "@eventual/core";
import { workflowClient } from "./client-create.js";

export interface Test<W extends Workflow = Workflow> {
  name: string;
  workflow: W;
  input?: WorkflowInput<W>;
  test: (
    executionId: string,
    context: { cancelCallback: () => boolean }
  ) => void | Promise<void>;
}

class TesterContainer {
  public readonly tests: Test[] = [];

  public test(name: string, workflow: Workflow, test: Test["test"]): void;
  public test<W extends Workflow = Workflow>(
    name: string,
    workflow: W,
    input: WorkflowInput<W>,
    test: Test["test"]
  ): void;
  public test<W extends Workflow = Workflow>(
    name: string,
    workflow: W,
    inputOrTest: any | WorkflowInput<W>,
    maybeTest?: Test["test"]
  ): void {
    const [input, test] =
      typeof inputOrTest === "function"
        ? [undefined, inputOrTest]
        : [inputOrTest, maybeTest];
    this.tests.push({
      name,
      workflow,
      input,
      test,
    });
  }

  public testCompletion<W extends Workflow = Workflow>(
    name: string,
    workflow: W,
    result: WorkflowOutput<W>
  ): void;
  public testCompletion<W extends Workflow = Workflow>(
    name: string,
    workflow: W,
    input: WorkflowInput<W>,
    result: WorkflowOutput<W>
  ): void;
  public testCompletion<W extends Workflow = Workflow>(
    name: string,
    workflow: W,
    ...args:
      | [input: WorkflowInput<W>, output: WorkflowOutput<W>]
      | [output: WorkflowOutput<W>]
  ): void {
    const [input, output] = args.length === 1 ? [undefined, args[0]] : args;

    this.test(
      name,
      workflow,
      input as unknown as any,
      async (executionId, { cancelCallback }) => {
        const execution = await waitForWorkflowCompletion<W>(
          executionId,
          cancelCallback
        );

        assertCompleteExecution(execution);

        expect(execution.result).toEqual(output);
      }
    );
  }

  public testFailed<W extends Workflow = Workflow>(
    name: string,
    workflow: Workflow,
    result: WorkflowOutput<W>,
    error: string,
    message: string
  ): void;
  public testFailed<W extends Workflow = Workflow>(
    name: string,
    workflow: Workflow,
    input: WorkflowInput<W>,
    error: string,
    message: string
  ): void;
  public testFailed<W extends Workflow = Workflow>(
    name: string,
    workflow: Workflow,
    ...args:
      | [input: WorkflowInput<W>, error: string, message: string]
      | [error: string, message: string]
  ): void {
    const [input, error, message] =
      args.length === 2 ? [undefined, ...args] : args;

    this.test(
      name,
      workflow,
      input,
      async (executionId, { cancelCallback }) => {
        const execution = await waitForWorkflowCompletion<W>(
          executionId,
          cancelCallback
        );

        assertFailureExecution(execution);

        expect(execution.error).toEqual(error);
        expect(execution.message).toEqual(message);
      }
    );
  }
}

export function eventualRuntimeTestHarness(
  register: (tester: {
    test: TesterContainer["test"];
    testCompletion: TesterContainer["testCompletion"];
    testFailed: TesterContainer["testFailed"];
  }) => void
) {
  const tester = new TesterContainer();

  register({
    test: tester.test.bind(tester),
    testCompletion: tester.testCompletion.bind(tester),
    testFailed: tester.testFailed.bind(tester),
  });

  // start all of the workflow immediately, the tests can wait for them.
  const executionTests = tester.tests.map((_test) => ({
    execution: workflowClient.startWorkflow({
      workflowName: _test.workflow.workflowName,
      input: _test.input,
    }),
    test: _test,
  }));

  executionTests.forEach(({ execution, test: _test }) => {
    describe(_test.name, () => {
      let done = false;
      const cancelCallback = () => done;
      afterEach(() => {
        done = true;
      });
      test("test", async () => {
        const executionId = await execution;

        await _test.test(executionId, { cancelCallback });
      });
    });
  });
}

// TODO delay and backoff
export async function waitForWorkflowCompletion<W extends Workflow = Workflow>(
  executionId: string,
  cancelCallback?: () => boolean
): Promise<Execution<WorkflowOutput<W>>> {
  let execution: Execution | undefined;
  do {
    execution = await workflowClient.getExecution(executionId);
    if (!execution) {
      throw new Error("Cannot find execution id: " + executionId);
    }
    console.log(execution);
    await delay(1000);
  } while (
    execution.status === ExecutionStatus.IN_PROGRESS &&
    (!cancelCallback || !cancelCallback())
  );

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

export function assertFailureExecution(
  execution: Execution
): asserts execution is FailedExecution {
  expect(execution.status).toEqual(ExecutionStatus.FAILED);
}
