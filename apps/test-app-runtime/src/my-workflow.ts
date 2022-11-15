import { activity, eventual } from "@eventual/core";

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});

export default eventual(async (event: any) => {
  const result = await hello(event);
  console.log(result);
  return `you said ${result}`;
});
