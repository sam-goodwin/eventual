import fs from "fs/promises";
import path from "path";
import esbuild from "esbuild";
import { aliasPath } from "esbuild-plugin-alias-path";
import { eventualESPlugin } from "./esbuild-plugin.js";
import { prepareOutDir } from "./build.js";
import { ServiceType, SERVICE_TYPE_FLAG } from "@eventual/core";

export async function bundleSources(
  outDir: string,
  serviceEntry: string,
  appSpec: string,
  entries: Omit<BuildSource, "outDir" | "injectedEntry" | "injectedAppSpec">[],
  cleanOutput = false
) {
  console.log("Bundling:", outDir, serviceEntry);
  await prepareOutDir(outDir, cleanOutput);
  await Promise.all(
    entries
      .map((s) => ({
        ...s,
        outDir,
        injectedEntry: serviceEntry,
        injectedAppSpec: appSpec,
      }))
      .map(build)
  );
}

export async function bundleService(
  outDir: string,
  entry: string,
  serviceType?: ServiceType,
  external?: string[],
  allPackagesExternal?: boolean
) {
  await prepareOutDir(outDir);
  return build({
    outDir,
    entry,
    name: "service",
    eventualTransform: true,
    serviceType,
    external,
    allPackagesExternal,
    // It's important that we DONT use inline source maps for service, otherwise debugger fails to pick it up
    // sourcemap: "inline",
  });
}

export interface BuildSource {
  injectedEntry?: string;
  injectedAppSpec?: string;
  eventualTransform?: boolean;
  outDir: string;
  name: string;
  entry: string;
  sourcemap?: boolean | "inline";
  serviceType?: ServiceType;
  external?: string[];
  allPackagesExternal?: boolean;
}

async function build({
  outDir,
  injectedEntry,
  injectedAppSpec,
  name,
  entry,
  eventualTransform = false,
  sourcemap,
  serviceType,
  external,
  allPackagesExternal,
}: BuildSource) {
  const outfile = path.join(outDir, `${name}/index.mjs`);
  const bundle = await esbuild.build({
    mainFields: ["module", "main"],
    sourcemap: sourcemap ?? true,
    plugins: [
      ...(injectedEntry || injectedAppSpec
        ? [
            aliasPath({
              alias: {
                ...(injectedEntry
                  ? {
                      "@eventual/injected/entry.js":
                        path.resolve(injectedEntry),
                    }
                  : {}),
                ...(injectedAppSpec
                  ? {
                      "@eventual/injected/spec.json":
                        path.resolve(injectedAppSpec),
                    }
                  : {}),
              },
            }),
          ]
        : []),
      ...(eventualTransform ? [eventualESPlugin] : []),
    ],
    conditions: ["module", "import", "require"],
    // supported with NODE_18.x runtime
    // TODO: make this configurable.
    // external: ["@aws-sdk"],
    external,
    // does not include any node modules packages in the bundle
    packages: allPackagesExternal ? "external" : undefined,
    platform: "node",
    format: "esm",
    // Target for node 16
    target: "es2021",
    metafile: true,
    bundle: true,
    entryPoints: [path.resolve(entry)],
    banner: esmPolyfillRequireBanner(),
    outfile,
    define: serviceType
      ? {
          [`process.env.${SERVICE_TYPE_FLAG}`]: serviceType,
        }
      : undefined,
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
