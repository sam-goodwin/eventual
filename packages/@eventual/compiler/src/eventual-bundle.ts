import fs from "fs/promises";
import path from "path";
import esbuild from "esbuild";
import { eventualESPlugin } from "./esbuild-plugin.js";
import { esbuildPluginAliasPath } from "esbuild-plugin-alias-path";
import { prepareOutDir } from "./build.js";

const getOutFiles = (outDir: string) => ({
  orchestrator: path.join(outDir, "orchestrator/index.mjs"),
  activityWorker: path.join(outDir, "activity-worker/index.mjs"),
  workflow: path.join(outDir, "workflow/index.mjs"),
});

/**
 * Bundle an eventual program
 * @param outDir Directory to bundle to
 * @param entry File containing the program, where default export is our workflow
 * @returns Paths to orchestrator and activtyWorker output files
 */
export async function bundle(
  outDir: string,
  entries: {
    workflow: string;
    orchestrator: string;
    activityWorker: string;
  }
): Promise<{ orchestrator: string; activityWorker: string }> {
  console.log("Bundling:", outDir, entries);
  await prepareOutDir(outDir);

  await Promise.all([
    bundleOrchestrator(outDir, entries),
    bundleActivityWorker(outDir, entries),
  ]);

  console.log("Output: ", getOutFiles(outDir));
  return getOutFiles(outDir);
}

export async function bundleWorkflow(outDir: string, entry: string) {
  await prepareOutDir(outDir);
  const outfile = getOutFiles(outDir).workflow;

  const result = await esbuild.build({
    mainFields: ["module", "main"],
    sourcemap: "inline",
    plugins: [eventualESPlugin],
    conditions: ["module", "import", "require"],
    // supported with NODE_18.x runtime
    // TODO: make this configurable.
    // external: ["@aws-sdk"],
    platform: "node",
    format: "esm",
    metafile: true,
    bundle: true,
    entryPoints: [entry],
    outfile,
  });
  await writeEsBuildMetafile(result, path.join(outDir, "workflow/meta.json"));

  return outfile;
}

async function bundleOrchestrator(
  outDir: string,
  entries: {
    workflow: string;
    orchestrator: string;
  }
) {
  const result = await esbuild.build({
    mainFields: ["module", "main"],
    sourcemap: true,
    plugins: [
      esbuildPluginAliasPath({
        alias: {
          "@eventual/injected/workflow": path.resolve(entries.workflow),
        },
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
    entryPoints: [entries.orchestrator],
    banner: esmPolyfillRequireBanner(),
    outfile: getOutFiles(outDir).orchestrator,
  });
  await writeEsBuildMetafile(
    result,
    path.join(outDir, "orchestrator/meta.json")
  );
  return result;
}

async function bundleActivityWorker(
  outDir: string,
  entries: {
    workflow: string;
    activityWorker: string;
  }
) {
  const result = await esbuild.build({
    mainFields: ["module", "main"],
    sourcemap: true,
    conditions: ["module", "import", "require"],
    plugins: [
      esbuildPluginAliasPath({
        alias: {
          "@eventual/injected/activities": path.resolve(entries.workflow),
        },
      }),
      eventualESPlugin,
    ],
    // supported with NODE_18.x runtime
    // TODO: make this configurable.
    // external: ["@aws-sdk"],
    platform: "node",
    format: "esm",
    metafile: true,
    bundle: true,
    entryPoints: [entries.activityWorker],
    banner: esmPolyfillRequireBanner(),
    outfile: getOutFiles(outDir).activityWorker,
  });
  await writeEsBuildMetafile(
    result,
    path.join(outDir, "activity-worker/meta.json")
  );
  return result;
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

function writeEsBuildMetafile(
  esbuildResult: esbuild.BuildResult & { metafile: esbuild.Metafile },
  path: string
) {
  return fs.writeFile(path, JSON.stringify(esbuildResult.metafile));
}
