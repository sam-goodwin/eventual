/**
 * This script imports a user's script and outputs a JSON object
 * to stdout containing all of the data that can be inferred.
 *
 * @see AppSpec
 */
import { AppSpec, eventSubscriptions } from "@eventual/core";
import crypto from "crypto";
import esbuild from "esbuild";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function infer() {
  let scriptName = process.argv[2];
  if (scriptName === undefined) {
    throw new Error(`scriptName undefined`);
  }

  if (scriptName.endsWith("ts")) {
    const tmp = os.tmpdir();

    const bundle = await esbuild.build({
      mainFields: ["module", "main"],
      entryPoints: [scriptName],
      sourcemap: false,
      bundle: true,
      write: false,
      platform: "node",
    });

    const script = bundle.outputFiles[0]!.text;
    const hash = crypto.createHash("md5").update(script).digest("hex");
    scriptName = path.join(tmp, `${hash}.js`);
    await fs.writeFile(scriptName, script);
  }

  await import(scriptName);

  const eventualData: AppSpec = {
    subscriptions: eventSubscriptions().flatMap((e) => e.subscriptions),
  };

  console.log(JSON.stringify(eventualData));
}
