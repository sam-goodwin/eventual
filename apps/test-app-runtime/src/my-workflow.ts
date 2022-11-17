import { activity, eventual } from "@eventual/core";

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});

export default eventual(async ({ name }: { name: string }) => {
  const result = await hello(name);
  console.log(result);
  return `you said ${result}`;
});
