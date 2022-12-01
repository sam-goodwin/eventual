import { activity, sleepFor, sleepUntil, workflow } from "@eventual/core";

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});

export const workflow1 = workflow(
  "my-workflow",
  async ({ name }: { name: string }) => {
    const result = await hello(name);
    return `you said ${result}`;
  }
);

export const workflow2 = workflow("my-parent-workflow", async () => {
  const result = await workflow1({ name: "sam" });
  return `user: ${result}`;
});

export const workflow3 = workflow("sleepy", async () => {
  await sleepFor(2);
  await sleepUntil(new Date(new Date().getTime() + 1000 * 2));
  return `done!`;
});

export const workflow4 = workflow("parallel", async () => {
  return Promise.all([hello("sam"), hello("chris"), hello("sam")]);
});
