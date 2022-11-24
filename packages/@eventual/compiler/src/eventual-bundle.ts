import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import esbuild from "esbuild";
import { eventualESPlugin } from "./esbuild-plugin.js";
import { esbuildPluginAliasPath } from "esbuild-plugin-alias-path";

const getOutFiles = (outDir: string) => ({
  orchestrator: path.join(outDir, "orchestrator/index.mjs"),
  activityWorker: path.join(outDir, "activity-worker/index.mjs"),
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
  await prepareOutDir(outDir);
  await Promise.all([
    bundleOrchestrator(outDir, entries),
    bundleActivityWorker(outDir, entries),
  ]);

  return getOutFiles(outDir);
}

export async function prepareAndBundleOrchestrator(
  outDir: string,
  entries: {
    workflow: string;
    orchestrator: string;
  }
) {
  await prepareOutDir(outDir);
  await bundleOrchestrator(outDir, entries);
  return getOutFiles(outDir).orchestrator;
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
      // eventualESPlugin,
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
  writeEsBuildMetafile(path.join(outDir, "orchestrator/meta.json"));
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
  writeEsBuildMetafile(path.join(outDir, "activity-worker/meta.json"));
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

function writeEsBuildMetafile(path: string) {
  return (
    esbuildResult: esbuild.BuildResult & { metafile: esbuild.Metafile }
  ) => fs.writeFile(path, JSON.stringify(esbuildResult.metafile));
}

export async function prepareOutDir(outDir: string) {
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
