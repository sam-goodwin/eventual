#! /usr/bin/env node
import bundle from "../lib/eventual-bundle.js";

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
