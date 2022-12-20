import path from "path";
import * as url from "url";
import { TestEnvironment } from "../src/environment.js";
import { workflow2 } from "./workflow.js";

test("start workflow", async () => {
  const env = new TestEnvironment({
    entry: path.resolve(
      url.fileURLToPath(new URL(".", import.meta.url)),
      "./workflow.ts"
    ),
    outDir: path.resolve(
      url.fileURLToPath(new URL(".", import.meta.url)),
      ".eventual"
    ),
  });

  const result = await env.startExecution(workflow2, undefined);

  console.log(result);

  expect(result).toMatchObject({
    commands: [],
  });
});
