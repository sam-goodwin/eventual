import { task, workflow } from "@eventual/core";

export default workflow("my-workflow", async ({ name }: { name: string }) => {
  const result = await Promise.all([hello(name), hello2(name)]);
  console.log(result);
  const result2 = await hello(name);
  return `you said ${result2} ${result}`;
});

const hello = task("hello", async (name: string) => {
  return `hello ${name}`;
});

const hello2 = task("hello2", async (name: string) => {
  return `hello2 ${name}`;
});
