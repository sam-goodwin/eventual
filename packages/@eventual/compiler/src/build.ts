import { constants } from "fs";
import fs from "fs/promises";
import path from "path";

export async function prepareOutDir(outDir: string, clean: boolean = true) {
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
