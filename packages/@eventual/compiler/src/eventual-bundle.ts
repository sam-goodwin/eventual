import fs from "fs/promises";
import path from "path";
import esbuild from "esbuild";
import { esbuildPluginAliasPath } from "esbuild-plugin-alias-path";
import { eventualESPlugin } from "./esbuild-plugin.js";
import { prepareOutDir } from "./build.js";
import { createRequire } from "module";

// @ts-ignore - ts is complaining about not having module:esnext even thought it is in tsconfig.json
const require = createRequire(import.meta.url);

/**
 * Bundle an eventual program
 * @param outDir Directory to bundle to
 * @param entry File containing the service
 * @returns Paths to orchestrator and activtyWorker output files
 */
export async function bundle(
  outDir: string,
  serviceEntry: string
): Promise<void> {
  console.log("Bundling:", outDir, serviceEntry);
  await prepareOutDir(outDir);

  await Promise.all([
    build({
      name: "orchestrator",
      outDir,
      injectedEntry: serviceEntry,
      entry: runtimeEntrypoint("orchestrator"),
      plugins: [eventualESPlugin],
    }),
    build({
      name: "activity",
      outDir,
      injectedEntry: serviceEntry,
      entry: runtimeEntrypoint("activity-worker"),
    }),
    build({
      name: "api",
      outDir,
      injectedEntry: serviceEntry,
      entry: runtimeEntrypoint("api-handler"),
    }),
    //This one is actually an api function
    build({
      name: "list-workflows",
      outDir,
      injectedEntry: serviceEntry,
      entry: runtimeEntrypoint("list-workflows"),
    }),
  ]);
}

export async function bundleService(outDir: string, entry: string) {
  await prepareOutDir(outDir);
  return build({
    outDir,
    entry,
    name: "service",
    plugins: [eventualESPlugin],
    //It's important that we use inline source maps for service, otherwise debugger fails to pick it up
    sourcemap: "inline",
  });
}

export function runtimeEntrypoint(name: string) {
  return path.join(
    require.resolve("@eventual/aws-runtime"),
    `../../esm/handlers/${name}.js`
  );
}

async function build({
  outDir,
  injectedEntry,
  name,
  entry,
  plugins,
  sourcemap,
}: {
  injectedEntry?: string;
  outDir: string;
  name: string;
  entry: string;
  plugins?: esbuild.Plugin[];
  sourcemap?: boolean | "inline";
}) {
  const outfile = path.join(outDir, `${name}/index.mjs`);
  const bundle = await esbuild.build({
    mainFields: ["module", "main"],
    sourcemap: sourcemap ?? true,
    plugins: [
      ...(injectedEntry
        ? [
            esbuildPluginAliasPath({
              alias: {
                ["@eventual/entry/injected"]: path.resolve(injectedEntry),
              },
            }),
          ]
        : []),
      ...(plugins ?? []),
    ],
    conditions: ["module", "import", "require"],
    // supported with NODE_18.x runtime
    // TODO: make this configurable.
    // external: ["@aws-sdk"],
    platform: "node",
    format: "esm",
    //Target for node 16
    target: "es2021",
    metafile: true,
    bundle: true,
    entryPoints: [path.resolve(entry)],
    banner: esmPolyfillRequireBanner(),
    outfile,
  });

  await writeEsBuildMetafile(
    bundle,
    path.resolve(outDir!, `${name}/meta.json`)
  );

  return outfile;
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
