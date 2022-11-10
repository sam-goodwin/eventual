import "jest";

import path from "path";
import esbuild from "esbuild";
import { eventualESPlugin } from "../src/esbuild-plugin";

test("esbuild-plugin", async () => {
  const bundle = await esbuild.build({
    mainFields: ["module", "main"],
    entryPoints: [path.resolve(__dirname, "..", "test-files", "workflow.ts")],
    sourcemap: false,
    plugins: [eventualESPlugin],
    bundle: true,
    write: false,
  });

  expect(bundle.outputFiles![0]?.text).toMatchSnapshot();
});
