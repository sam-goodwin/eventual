import fs from "fs/promises";
import { updateJsonFile } from "./json-file";

export async function addTsReferences(
  file: string,
  references: string[]
): Promise<void> {
  await updateJsonFile(file, (tsconfig) => {
    const refs = new Set((tsconfig.references ??= []));
    for (const path of references) {
      if (!refs.has(path)) {
        tsconfig.references.push({ path: path });
      }
    }
    (tsconfig.references as { path: string }[]).sort((a, b) =>
      a.path.localeCompare(b.path)
    );
  });
}

export async function modifyTsConfig(
  file: string,
  transformations: Array<(tsConfig: any) => void>
) {
  const tsConfig = JSON.parse((await fs.readFile(file)).toString("utf-8"));
  tsConfig.compilerOptions ??= {};
  tsConfig.compilerOptions.lib ??= [];
  for (const t of transformations) {
    t(tsConfig);
  }
  await fs.writeFile(file, JSON.stringify(tsConfig, null, 2));
}

export async function addTsLib(tsConfig: any, ...libs: string[]) {
  const lib = tsConfig.compilerOptions.lib;
  for (const newLib of libs) {
    if (
      lib.find(
        (existingLib: string) =>
          existingLib.toLowerCase() === newLib.toLowerCase()
      ) === undefined
    ) {
      lib.push(newLib);
    }
  }
}
