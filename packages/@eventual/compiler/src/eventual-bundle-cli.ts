import { Buffer } from "buffer";
import { BuildSource, bundleSources } from "./eventual-bundle.js";

export async function cli() {
  try {
    const [, , outDir, serviceEntry, appSpecPath, sources] = process.argv;
    if (!(outDir && serviceEntry && sources && appSpecPath)) {
      throw new Error(
        `Usage: eventual-build <out-dir> <entry-point> <app-spec-path> <sources>`
      );
    }
    const sourceEntries = JSON.parse(
      Buffer.from(sources, "base64").toString("utf-8")
    ) as BuildSource[];
    await bundleSources(outDir, serviceEntry, appSpecPath, sourceEntries);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
