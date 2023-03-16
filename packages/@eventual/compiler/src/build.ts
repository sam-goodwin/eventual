import crypto from "crypto";
import { constants } from "fs";
import fs from "fs/promises";
import path from "path";
import { bundleService } from "./eventual-bundle.js";

export async function prepareOutDir(outDir: string, clean = true) {
  try {
    await fs.access(outDir, constants.F_OK);
    if (clean) {
      await cleanDir(outDir);
    }
  } catch (e) {
    await fs.mkdir(outDir, {
      recursive: true,
    });
  }
}

export async function cleanDir(dir: string) {
  await Promise.all(
    (
      await fs.readdir(dir)
    ).map((file) =>
      fs.rm(path.join(dir, file), { force: true, recursive: true })
    )
  );
}

export async function loadService(
  entry: string,
  plugins?: any[],
  sourceMaps: boolean | "inline" = "inline"
) {
  const hash = crypto.createHash("md5").update(entry).digest("hex");

  console.log("loadService", entry);

  const script = await bundleService(
    path.join(".eventual", "server", hash),
    entry,
    undefined,
    undefined,
    undefined,
    plugins,
    sourceMaps
  );

  console.log("script", script);

  await import(path.resolve(script));
}
