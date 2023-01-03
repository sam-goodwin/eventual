/**
 * TODO move this into compile once compile supports CJS.
 */

import type { BuildSource } from "@eventual/compiler";
import { AppSpec } from "@eventual/core";
import { execSync } from "child_process";

export function bundleSourcesSync(
  outDir: string,
  serviceEntry: string,
  ...sources: Omit<BuildSource, "outDir" | "injectedEntry">[]
) {
  execSync(
    `node ${require.resolve(
      "@eventual/compiler/bin/eventual-bundle.js"
    )} "${outDir}" "${serviceEntry}" ${Buffer.from(
      JSON.stringify(sources)
    ).toString("base64")}`
  ).toString("utf-8");
}

export function inferSync(serviceEntry: string): AppSpec {
  return JSON.parse(
    execSync(
      `node "${require.resolve(
        "@eventual/compiler/bin/eventual-infer.js"
      )}" "${serviceEntry}"`
    ).toString("utf-8")
  );
}
