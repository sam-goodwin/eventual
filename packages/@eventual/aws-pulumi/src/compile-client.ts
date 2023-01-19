/**
 * TODO move this into compile once compile supports CJS.
 */

import type { BuildSource } from "@eventual/compiler";
import type { AppSpec } from "@eventual/core";
import cp from "child_process";
import util from "util";

const exec = util.promisify(cp.exec);

export async function bundleSources(
  outDir: string,
  serviceEntry: string,
  ...sources: Omit<BuildSource, "outDir" | "injectedEntry">[]
) {
  await exec(
    `node ${require.resolve(
      "@eventual/compiler/bin/eventual-bundle.js"
    )} "${outDir}" "${serviceEntry}" ${Buffer.from(
      JSON.stringify(sources)
    ).toString("base64")}`
  );
}

export async function infer(serviceEntry: string): Promise<AppSpec> {
  return JSON.parse(
    (
      await exec(
        `node "${require.resolve(
          "@eventual/compiler/bin/eventual-infer.js"
        )}" "${serviceEntry}"`
      )
    ).stdout
  );
}
