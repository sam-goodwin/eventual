import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import esbuild from "esbuild";
import { esbuildPluginAliasPath } from "esbuild-plugin-alias-path";
import { eventualESPlugin } from "./esbuild-plugin";

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
    build({
      name: "orchestrator",
      plugins: [eventualESPlugin],
    }),
    build({
      name: "activity",
    }),
    build({
      name: "webhook",
    }),
  ]);

  async function build({
    name,
    plugins,
  }: {
    name: string;
    plugins?: esbuild.Plugin[];
  }) {
    const bundle = await esbuild.build({
      mainFields: ["module", "main"],
      sourcemap: true,
      plugins: [
        esbuildPluginAliasPath({
          alias: {
            [`@eventual/entry/injected`]: entry!,
          },
        }),
        ...(plugins ?? []),
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
          `../../esm/entry/${name}.js`
        ),
      ],
      banner: esmPolyfillRequireBanner(),
      outfile: path.join(outDir!, `${name}/index.mjs`),
    });

    await writeEsBuildMetafile(path.join(outDir!, `${name}/meta.json`))(bundle);
  }
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
