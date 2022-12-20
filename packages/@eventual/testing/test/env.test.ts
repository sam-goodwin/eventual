import { ExecutionStatus } from "@eventual/core";
import path from "path";
import * as url from "url";
import { TestEnvironment } from "../src/environment.js";
import { workflow3 } from "./workflow.js";

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

  await env.start();

  const result = await env.startExecution(workflow3, undefined);

  const r1 = await result.tryGetResult();
  expect(r1).toEqual({ status: ExecutionStatus.IN_PROGRESS });

  env.tick();

  const r2 = await result.tryGetResult();
  expect(r2).toEqual({ status: ExecutionStatus.COMPLETE, result: "hi" });
});
