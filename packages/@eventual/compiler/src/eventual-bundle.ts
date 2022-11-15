import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import esbuild from "esbuild";
import { eventualESPlugin } from "./esbuild-plugin";
import { esbuildPluginAliasPath } from "esbuild-plugin-alias-path";

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
        platform: "node",
        format: "cjs",
        metafile: true,
        bundle: true,
        entryPoints: [
          path.join(
            require.resolve("@eventual/aws-runtime"),
            "../../esm/entry/orchestrator.js"
          ),
        ],
        outfile: path.join(outDir, "orchestrator/index.js"),
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
        platform: "node",
        format: "cjs",
        metafile: true,
        bundle: true,
        entryPoints: [
          path.join(
            require.resolve("@eventual/aws-runtime"),
            "../../esm/entry/activity-worker.js"
          ),
        ],
        outfile: path.join(outDir, "activity-worker/index.js"),
      })
      .then(
        writeEsBuildMetafile(path.join(outDir, "activity-worker/meta.json"))
      ),
  ]);
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
