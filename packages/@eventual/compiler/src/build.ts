import { constants } from "fs";
import fs from "fs/promises";
import path from "path";

export async function prepareOutDir(outDir: string, clean: boolean = true) {
  try {
    await fs.access(outDir, constants.F_OK);
    if (clean) {
      await cleanDir(outDir);
    }
  } catch {
    await fs.mkdir(outDir, {
      recursive: true,
    });
  }
}
export async function rmrf(file: string) {
  const stat = await fs.stat(file);
  if (stat.isDirectory()) {
    await cleanDir(file);
  } else {
    await fs.rm(file);
  }
}

export async function cleanDir(dir: string) {
  await Promise.all(
    (await fs.readdir(dir)).map((file) => rmrf(path.join(dir, file)))
  );
}
