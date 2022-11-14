import "jest";

import path from "path";
import esbuild from "esbuild";
import { eventualESPlugin } from "../src/esbuild-plugin";

describe("esbuild-plugin", () => {
  test("ts workflow", async () => {
    const bundle = await esbuild.build({
      mainFields: ["module", "main"],
      entryPoints: [path.resolve(__dirname, "..", "test-files", "workflow.ts")],
      sourcemap: false,
      plugins: [eventualESPlugin],
      bundle: true,
      write: false,
    });

    expect(
      bundle
        .outputFiles![0]?.text.split("\n")
        // HACK: filter out comment that is breaking the tests when run from VS Code
        // TODO: figure out why running vs code test is having trouble identifying the right
        //       tsconfig.test.json without a configuration at the root.
        // HINT: something to do with `.vscode/launch.json`
        .filter((line) => !line.includes("test-files/workflow.ts"))
        .join("\n")
    ).toMatchSnapshot();
  });

  test("ts not workflow", async () => {
    const bundle = await esbuild.build({
      mainFields: ["module", "main"],
      entryPoints: [
        path.resolve(__dirname, "..", "test-files", "not-workflow.ts"),
      ],
      sourcemap: false,
      plugins: [eventualESPlugin],
      bundle: true,
      write: false,
    });

    expect(bundle.outputFiles![0]?.text).toMatchSnapshot();
  });

  test("mts workflow", async () => {
    const bundle = await esbuild.build({
      mainFields: ["module", "main"],
      entryPoints: [
        path.resolve(__dirname, "..", "test-files", "workflow.mts"),
      ],
      sourcemap: false,
      plugins: [eventualESPlugin],
      bundle: true,
      write: false,
    });

    expect(bundle.outputFiles![0]?.text).toMatchSnapshot();
  });

  test("json file", async () => {
    const bundle = await esbuild.build({
      mainFields: ["module", "main"],
      entryPoints: [
        path.resolve(__dirname, "..", "test-files", "json-file.json"),
      ],
      sourcemap: false,
      plugins: [eventualESPlugin],
      bundle: true,
      write: false,
    });

    expect(bundle.outputFiles![0]?.text).toMatchSnapshot();
  });
});
