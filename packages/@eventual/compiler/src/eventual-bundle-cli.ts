import { Buffer } from "buffer";
import { BuildSource, bundleSources } from "./eventual-bundle.js";

export async function cli() {
  try {
    const [, , outDir, sources] = process.argv;
    if (!(outDir && sources)) {
      throw new Error(`Usage: eventual-build <out-dir> <sources>`);
    }
    const sourceEntries = JSON.parse(
      Buffer.from(sources, "base64").toString("utf-8")
    ) as BuildSource[];
    await bundleSources(outDir, sourceEntries);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
