import {
  SucceededExecution,
  Execution,
  ExecutionStatus,
  FailedExecution,
  Workflow,
  WorkflowInput,
  WorkflowOutput,
  ExecutionHandle,
} from "@eventual/core";
import { AwsHttpServiceClient } from "@eventual/aws-client";
import { chaosSSMParamName, serviceUrl } from "./env.js";
import { ChaosRule } from "./chaos-extension/chaos-engine.js";
import { SSMChaosClient } from "./chaos-extension/chaos-client.js";
import { SSMClient } from "@aws-sdk/client-ssm";

const serviceClient = new AwsHttpServiceClient({
  serviceUrl: serviceUrl(),
  region: "us-east-1",
});

const ssm = new SSMClient({});
const chaosClient = new SSMChaosClient(chaosSSMParamName(), ssm);

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
    result: WorkflowOutput<W> | ((r: WorkflowOutput<W>) => void)
  ): void;

  public testCompletion<W extends Workflow = Workflow>(
    name: string,
    workflow: W,
    input: WorkflowInput<W>,
    result: WorkflowOutput<W> | ((r: WorkflowOutput<W>) => void)
  ): void;

  public testCompletion<W extends Workflow = Workflow>(
    name: string,
    workflow: W,
    ...args:
      | [
          input: WorkflowInput<W>,
          output: WorkflowOutput<W> | ((r: WorkflowOutput<W>) => void)
        ]
      | [output: WorkflowOutput<W> | ((r: WorkflowOutput<W>) => void)]
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

        if (typeof output === "function") {
          (output as (r: WorkflowOutput<W>) => void)(
            execution.result as WorkflowOutput<W>
          );
        } else {
          typeof output === "object"
            ? expect(execution.result).toMatchObject(output)
            : expect(execution.result).toEqual(output);
        }
      }
    );
  }

  public testFailed<W extends Workflow = Workflow>(
    name: string,
    workflow: Workflow,
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

export interface TestSetFunction {
  (tester: {
    test: TesterContainer["test"];
    testCompletion: TesterContainer["testCompletion"];
    testFailed: TesterContainer["testFailed"];
  }): void;
}

export interface TestSetProps {
  name?: string;
  chaos: { rules: ChaosRule[]; durationMillis: number };
  register: TestSetFunction;
}

/**
 * Register one or more test sets to be run against the an Eventual Runtime.
 *
 * A test set may introduce "chaos", which applies a set of rules for
 * the duration given.
 */
export function eventualRuntimeTestHarness(
  ...testSets: (TestSetFunction | TestSetProps)[]
) {
  testSets.forEach((registerConfig, i) => {
    const tester = new TesterContainer();

    const [register, chaos] =
      typeof registerConfig === "function"
        ? [registerConfig, undefined]
        : [registerConfig.register, registerConfig.chaos];

    register({
      test: tester.test.bind(tester),
      testCompletion: tester.testCompletion.bind(tester),
      testFailed: tester.testFailed.bind(tester),
    });

    describe(registerConfig.name ?? `test set ${i}`, () => {
      let executions: Promise<ExecutionHandle<any>>[];
      beforeAll(async () => {
        if (chaos) {
          // break something!! muahahaha
          await chaosClient.setConfiguration({
            disabled: false,
            rules: chaos.rules,
          });
        } else {
          await chaosClient.disable();
        }

        // start all of the workflow immediately, the tests can wait for them.
        executions = tester.tests.map((_test) =>
          serviceClient.startExecution({
            workflow: _test.workflow,
            input: _test.input,
          })
        );

        if (chaos) {
          // let the workflows run with the chaos rules for a while
          await delay(chaos.durationMillis);
          await chaosClient.disable();
        }
      });

      tester.tests.forEach((_test, j) => {
        describe(_test.name, () => {
          let done = false;
          const cancelCallback = () => done;
          afterEach(() => {
            done = true;
          });
          test("test", async () => {
            const execution = executions[j]!;
            const { executionId } = await execution;

            await _test.test(executionId, { cancelCallback });
          });
        });
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
    execution = await serviceClient.getExecution(executionId);
    if (!execution) {
      throw new Error("Cannot find execution id: " + executionId);
    }
    console.log(execution);
    await delay(1000);
  } while (
    execution.status === ExecutionStatus.IN_PROGRESS &&
    !(cancelCallback?.() ?? false)
  );

  return execution;
}

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertCompleteExecution(
  execution: Execution
): asserts execution is SucceededExecution {
  expect(execution.status).toEqual(ExecutionStatus.SUCCEEDED);
}

export function assertFailureExecution(
  execution: Execution
): asserts execution is FailedExecution {
  expect(execution.status).toEqual(ExecutionStatus.FAILED);
}
