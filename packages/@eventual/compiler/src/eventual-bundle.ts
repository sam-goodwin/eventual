import fs from "fs/promises";
import path from "path";
import esbuild from "esbuild";
import { eventualESPlugin } from "./esbuild-plugin";
import { esbuildPluginAliasPath } from "esbuild-plugin-alias-path";
import { prepareOutDir } from "./build";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const [, , outDir, entry] = process.argv;

  if (!(outDir && entry)) {
    throw new Error(`Usage: eventual-build <out-dir> <entry-point>`);
  }

  await prepareOutDir(outDir);

  await Promise.all([
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
            require.resolve("@eventual/aws-runtime"),
            "../../esm/entry/orchestrator.js"
          ),
        ],
        // // ulid
        banner: esmPolyfillRequireBanner(),
        outfile: path.join(outDir, "orchestrator/index.mjs"),
      })
      .then(writeEsBuildMetafile(path.join(outDir, "orchestrator/meta.json"))),
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
            require.resolve("@eventual/aws-runtime"),
            "../../esm/entry/activity-worker.js"
          ),
        ],
        banner: esmPolyfillRequireBanner(),
        outfile: path.join(outDir, "activity-worker/index.mjs"),
      })
      .then(
        writeEsBuildMetafile(path.join(outDir, "activity-worker/meta.json"))
      ),
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
