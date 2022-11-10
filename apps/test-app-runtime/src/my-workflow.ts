import { activity, eventual } from "@eventual/core";

const hello = activity("hello", async (name: string) => {
  return `hello ${name}`;
});

export default eventual(async (event: any) => {
  console.log(await hello(event));
});
