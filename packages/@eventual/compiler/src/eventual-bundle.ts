import { ServiceType, SERVICE_TYPE_FLAG } from "@eventual/core/internal";
import esbuild from "esbuild";
import { aliasPath } from "esbuild-plugin-alias-path";
import fs from "fs/promises";
import path from "path";
import { prepareOutDir } from "./build.js";
// import { eventualESPlugin } from "./esbuild-plugin.js";

export async function bundleSources(
  outDir: string,
  entries: Omit<BuildSource, "outDir">[],
  cleanOutput = false
) {
  await prepareOutDir(outDir, cleanOutput);
  await Promise.all(entries.map((s) => ({ ...s, outDir })).map(build));
}

export async function bundleService(
  outDir: string,
  entry: string,
  serviceSpec?: string,
  serviceType?: ServiceType,
  external?: string[],
  allPackagesExternal?: boolean
) {
  await prepareOutDir(outDir);
  return build({
    outDir,
    injectedEntry: entry,
    injectedServiceSpec: serviceSpec,
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
  eventualTransform?: boolean;
  outDir: string;
  name: string;
  entry: string;
  injectedEntry: string;
  injectedServiceSpec?: string;
  /**
   * Optionally provide the name of the handler that should be tree-shaken.
   *
   * If it is undefined, then the entire file is bundled.
   */
  exportName?: string;
  sourcemap?: boolean | "inline";
  serviceType?: ServiceType;
  external?: string[];
  allPackagesExternal?: boolean;
  metafile?: boolean;
}

export async function build({
  outDir,
  injectedEntry,
  injectedServiceSpec,
  name,
  entry,
  // eventualTransform = false,
  sourcemap,
  serviceType,
  external,
  allPackagesExternal,
  metafile,
}: BuildSource): Promise<string> {
  const codeDir = path.join(outDir, name);
  await fs.mkdir(codeDir, {
    recursive: true,
  });
  const outfile = path.join(codeDir, "index.mjs");

  const bundle = await esbuild.build({
    mainFields: ["module", "main"],
    sourcemap: sourcemap ?? true,
    sourcesContent: false,
    plugins: [
      ...(injectedEntry || injectedServiceSpec
        ? [
            aliasPath({
              alias: {
                ...(injectedEntry
                  ? {
                      "@eventual/injected/entry": path.resolve(injectedEntry),
                    }
                  : {}),
                ...(injectedServiceSpec
                  ? {
                      "@eventual/injected/spec":
                        path.resolve(injectedServiceSpec),
                    }
                  : {}),
              },
            }),
          ]
        : []),
      // ...(eventualTransform ? [eventualESPlugin] : []),
    ],
    conditions: ["module", "import", "require"],
    // external: ["@aws-sdk"],
    external,
    // does not include any node modules packages in the bundle
    packages: allPackagesExternal ? "external" : undefined,
    platform: "node",
    format: "esm",
    // Target for node 18
    target: "es2022",
    metafile,
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
  esbuildResult: esbuild.BuildResult & { metafile?: esbuild.Metafile },
  path: string
) {
  if (esbuildResult.metafile) {
    return fs.writeFile(path, JSON.stringify(esbuildResult.metafile));
  } else {
    return Promise.resolve(undefined);
  }
}
