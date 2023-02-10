import "jest";

import path from "path";
import esbuild from "esbuild";
import { inferPlugin } from "../src/eventual-infer.js";
import url from "url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

test("api handlers should be decorated with source location", async () => {
  const bundle = await esbuild.build({
    mainFields: ["module", "main"],
    entryPoints: [
      path.resolve(__dirname, "..", "test-files", "api-handler.ts"),
    ],
    sourcemap: false,
    plugins: [inferPlugin],
    bundle: true,
    write: false,
    tsconfig: "tsconfig.json",
    platform: "node",
  });

  expect(sanitizeBundle(bundle)).toMatchSnapshot();
});

function sanitizeBundle(
  bundle: esbuild.BuildResult & {
    outputFiles: esbuild.OutputFile[];
  }
) {
  return (
    bundle
      .outputFiles![0]?.text.split("\n")
      // HACK: filter out comment that is breaking the tests when run from VS Code
      // TODO: figure out why running vs code test is having trouble identifying the right
      //       tsconfig.test.json without a configuration at the root.
      // HINT: something to do with `.vscode/launch.json`
      .filter((line) => !(line.includes("fileName:") || line.includes("// ")))
      .join("\n")
  );
}
