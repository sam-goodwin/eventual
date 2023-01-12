import fs from "fs/promises";

export async function overrideTsCompilerOptions(
  tsConfig: any,
  options: Record<string, string>
) {
  tsConfig.compilerOptions = { ...tsConfig.compilerOptions, ...options };
}

export async function writeJsonFile(file: string, obj: any) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}

export async function readJsonFile(file: string) {
  return JSON.parse((await fs.readFile(file)).toString("utf-8"));
}

export async function updateJsonFile(
  file: string,
  update: (obj: any) => void
): Promise<void> {
  const obj = await readJsonFile(file);
  update(obj);
  await writeJsonFile(file, obj);
}
