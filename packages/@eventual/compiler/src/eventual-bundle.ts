import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import esbuild from "esbuild";
import { eventualESPlugin } from "./esbuild-plugin.js";
import { esbuildPluginAliasPath } from "esbuild-plugin-alias-path";
import { resolve } from "import-meta-resolve";

export async function bundle(
  outDir: string,
  entry: string
): Promise<[workflow: string, activityWorker: string]> {
  await prepareOutDir(outDir);

  return await Promise.all([
    esbuild
      .build({
        mainFields: ["module", "main"],
        sourcemap: true,
        plugins: [
          esbuildPluginAliasPath({
            alias: { "@eventual/injected/workflow": entry },
          }),
          eventualESPlugin,
        ],
        conditions: ["module", "import", "require"],
        // supported with NODE_18.x runtime
        // TODO: make this configurable.
        // external: ["@aws-sdk"],
        platform: "node",
        format: "esm",
        metafile: true,
        bundle: true,
        entryPoints: [
          path.join(
            await import.meta.resolve!("@eventual/aws-runtime"),
            "../../esm/entry/orchestrator.js"
          ),
        ],
        // // ulid
        banner: esmPolyfillRequireBanner(),
        outfile: path.join(outDir, "orchestrator/index.mjs"),
      })
      .then((result) => {
        writeEsBuildMetafile(path.join(outDir, "orchestrator/meta.json"));
        return result.outputFiles![0]!.path;
      }),
    esbuild
      .build({
        mainFields: ["module", "main"],
        sourcemap: true,
        plugins: [
          esbuildPluginAliasPath({
            alias: { "@eventual/injected/activities": entry },
          }),
        ],
        conditions: ["module", "import", "require"],
        // supported with NODE_18.x runtime
        // TODO: make this configurable.
        // external: ["@aws-sdk"],
        platform: "node",
        format: "esm",
        metafile: true,
        bundle: true,
        entryPoints: [
          path.join(
            await resolve("@eventual/aws-runtime", import.meta.url),
            "../../esm/entry/activity-worker.js"
          ),
        ],
        banner: esmPolyfillRequireBanner(),
        outfile: path.join(outDir, "activity-worker/index.mjs"),
      })
      .then((result) => {
        writeEsBuildMetafile(path.join(outDir, "activity-worker/meta.json"));
        return result.outputFiles![0]!.path;
      }),
  ]);
}

/**
 * Allows ESM module bundles to support dynamo requires when necessary.
 */
function esmPolyfillRequireBanner() {
  return {
    js: [
      `import { createRequire as topLevelCreateRequire } from 'module'`,
      `const require = topLevelCreateRequire(import.meta.url)`,
    ].join("\n"),
  };
}

function writeEsBuildMetafile(path: string) {
  return (
    esbuildResult: esbuild.BuildResult & { metafile: esbuild.Metafile }
  ) => fs.writeFile(path, JSON.stringify(esbuildResult.metafile));
}

async function prepareOutDir(outDir: string) {
  try {
    await fs.access(outDir, constants.F_OK);
    await cleanDir(outDir);
  } catch {
    await fs.mkdir(outDir, {
      recursive: true,
    });
  }
}

async function rmrf(file: string) {
  const stat = await fs.stat(file);
  if (stat.isDirectory()) {
    await cleanDir(file);
  } else {
    await fs.rm(file);
  }
}

async function cleanDir(dir: string) {
  await Promise.all(
    (await fs.readdir(dir)).map((file) => rmrf(path.join(dir, file)))
  );
}
