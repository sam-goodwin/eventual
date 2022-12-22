import { ExecutionStatus } from "@eventual/core";
import path from "path";
import * as url from "url";
import { TestEnvironment } from "../src/environment.js";
import { workflow2, workflow3 } from "./workflow.js";

let env: TestEnvironment;

beforeAll(async () => {
  env = new TestEnvironment({
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
});

test("start workflow", async () => {
  // execution starts
  const result = await env.startExecution(workflow3, undefined);

  // see if the execution has completed
  const r1 = await result.tryGetResult();
  // we expect it to still be in progress
  expect(r1).toEqual({ status: ExecutionStatus.IN_PROGRESS });

  // progress time, the activity should be done now.
  // note: running real activities uses an async function and may not be done by the next tick
  await env.tick();

  // the workflow should be done now, the activity completed event should have been processed in the `tick`
  const r2 = await result.tryGetResult();
  // and the execution updated to a completed state
  expect(r2).toEqual({ status: ExecutionStatus.COMPLETE, result: "hi" });
});

test("workflow sleep", async () => {
  // execution starts
  const result = await env.startExecution(workflow2, undefined);

  // see if the execution has completed
  const r1 = await result.tryGetResult();
  // we expect it to still be in progress
  expect(r1).toEqual({ status: ExecutionStatus.IN_PROGRESS });

  // progress time, the sleep is for 10 seconds and should not be done
  await env.tick();

  // the workflow still not be done, have 9 more seconds left on the sleep
  const r2 = await result.tryGetResult();
  expect(r2).toEqual({ status: ExecutionStatus.IN_PROGRESS });

  // advance 9 seconds, the sleep time (minus 1)
  await env.tick(9);

  // the workflow still not be done, have 9 more seconds left on the sleep
  const r3 = await result.tryGetResult();
  expect(r3).toEqual({ status: ExecutionStatus.COMPLETE, result: "hi" });
});
