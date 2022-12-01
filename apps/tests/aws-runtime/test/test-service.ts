import { activity, sleepFor, sleepUntil, workflow } from "@eventual/core";
import {
  assertCompleteExecution,
  waitForWorkflowCompletion,
  test,
} from "./runtime-test-harness.js";

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});

const workflow1 = workflow(
  "my-workflow",
  async ({ name }: { name: string }) => {
    const result = await hello(name);
    return `you said ${result}`;
  }
);

test("call activity", workflow1, { name: "sam" }, async (executionId) => {
  const execution = await waitForWorkflowCompletion<typeof workflow1>(
    executionId
  );

  assertCompleteExecution(execution);

  expect(execution.result).toEqual("you said hello sam");
});

const workflow2 = workflow("my-parent-workflow", async () => {
  const result = await workflow1({ name: "sam" });
  return `user: ${result}`;
});

test("call workflow", workflow2, async (executionId) => {
  const execution = await waitForWorkflowCompletion<typeof workflow2>(
    executionId
  );

  assertCompleteExecution(execution);

  expect(execution.result).toEqual("user: you said hello sam");
});

const workflow3 = workflow("sleepy", async () => {
  await sleepFor(2);
  await sleepUntil(new Date(new Date().getTime() + 1000 * 2));
  return `done!`;
});

test("sleep", workflow3, async (executionId) => {
  const execution = await waitForWorkflowCompletion<typeof workflow3>(
    executionId
  );

  assertCompleteExecution(execution);

  expect(execution.result).toEqual("done!");
});

const workflow4 = workflow("parallel", async () => {
  return Promise.all([hello("sam"), hello("chris"), hello("sam")]);
});

test("parallel", workflow4, async (executionId) => {
  const execution = await waitForWorkflowCompletion<typeof workflow4>(
    executionId
  );

  assertCompleteExecution(execution);

  expect(execution.result).toEqual(["hello sam", "hello chris", "hello sam"]);
});
