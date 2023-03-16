import esbuild from "esbuild";
import { aliasPath } from "esbuild-plugin-alias-path";
import fs from "fs/promises";
import path from "path";
import { prepareOutDir } from "./build.js";

export async function bundleSources(
  outDir: string,
  entries: Omit<BuildSource, "outDir">[],
  cleanOutput = false
) {
  await prepareOutDir(outDir, cleanOutput);
  await Promise.all(
    entries.map((s) => ({ ...s, outDir })).map((entry) => build(entry))
  );
}

export async function bundleService(
  outDir: string,
  entry: string,
  serviceSpec?: string,
  external?: string[],
  allPackagesExternal?: boolean,
  plugins?: any[],
  sourceMap: boolean | "inline" = "inline",
  format?: "esm" | "cjs"
) {
  await prepareOutDir(outDir);
  return build(
    {
      outDir,
      injectedEntry: entry,
      injectedServiceSpec: serviceSpec,
      entry,
      name: "service",
      external,
      allPackagesExternal,
      sourcemap: sourceMap,
      format,
    },
    plugins
  );
}

export interface BuildSource {
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
  external?: string[];
  allPackagesExternal?: boolean;
  metafile?: boolean;
  /**
   * @default esm
   */
  format?: "esm" | "cjs";
}

export async function build(
  {
    outDir,
    injectedEntry,
    injectedServiceSpec,
    name,
    entry,
    sourcemap,
    external,
    allPackagesExternal,
    metafile,
    format,
  }: BuildSource,
  plugins?: any[]
): Promise<string> {
  const codeDir = path.join(outDir, name);
  await fs.mkdir(codeDir, {
    recursive: true,
  });
  const outfile = path.join(
    codeDir,
    format === "cjs" ? "index.js" : "index.mjs"
  );

  const bundle = await esbuild.build({
    mainFields: ["module", "main"],
    sourcemap: sourcemap ?? true,
    sourcesContent: false,
    plugins: [
      ...(plugins ?? []),
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
    ],
    conditions: ["module", "import", "require"],
    // external: ["@aws-sdk"],
    external,
    // does not include any node modules packages in the bundle
    packages: allPackagesExternal ? "external" : undefined,
    platform: "node",
    format,
    // Target for node 18
    target: "es2022",
    metafile,
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
  esbuildResult: esbuild.BuildResult & { metafile?: esbuild.Metafile },
  path: string
) {
  if (esbuildResult.metafile) {
    return fs.writeFile(path, JSON.stringify(esbuildResult.metafile));
  } else {
    return Promise.resolve(undefined);
  }
}
