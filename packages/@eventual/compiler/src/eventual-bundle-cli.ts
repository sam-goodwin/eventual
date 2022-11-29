import { bundle } from "./eventual-bundle.js";

export async function cli() {
  try {
    const [, , outDir, entry] = process.argv;
    if (!(outDir && entry)) {
      throw new Error(`Usage: eventual-build <out-dir> <entry-point>`);
    }
    await bundle(outDir, entry);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
