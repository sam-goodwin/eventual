import { readJsonFile, readJsonFileSync } from "./json-file.js";
import path from "path";

export interface EventualConfig {
  projectType: "aws-cdk";
  synth: string;
  deploy: string;
  /**
   * The directory where the .eventual directory will be created and looked for.
   *
   * If this is a relative path, the system will resolve it based on the
   * directory that contains the eventual config file.
   */
  outDir: string;
}

export const EventualManifestFileName = "eventual.json";

export async function discoverEventualConfig(
  dir = process.cwd(),
  depth: number = 2
): Promise<EventualConfig | undefined> {
  try {
    const filePath = path.join(dir, EventualManifestFileName);
    const file = await readJsonFile(filePath);
    if ("projectType" in file) {
      if (file.projectType === "aws-cdk") {
        return {
          ...file,
          // resolve to an absolute path
          // use the current directory if non is provided.
          outDir: file.outDir ? path.resolve(file.outDir) : dir,
        };
      } else {
        throw new Error(
          `unrecognized projectType "${file.projectType}" in eventual.json manifest: ${filePath}`
        );
      }
    } else {
      throw new Error(
        `unrecognized eventual.json manifest: ${filePath} is missing the projectType field.`
      );
    }
  } catch {
    if (depth) {
      return discoverEventualConfig(path.dirname(dir), depth - 1);
    }
    return undefined;
  }
}

export function discoverEventualConfigSync(
  dir = process.cwd(),
  depth: number = 2
): EventualConfig | undefined {
  try {
    const filePath = path.join(dir, EventualManifestFileName);
    const file = readJsonFileSync(filePath);
    if ("projectType" in file) {
      if (file.projectType === "aws-cdk") {
        return {
          ...file,
          // resolve to an absolute path
          // use the current directory if non is provided.
          outDir: file.outDir ? path.resolve(file.outDir) : dir,
        };
      } else {
        throw new Error(
          `unrecognized projectType "${file.projectType}" in eventual.json manifest: ${filePath}`
        );
      }
    } else {
      throw new Error(
        `unrecognized eventual.json manifest: ${filePath} is missing the projectType field.`
      );
    }
  } catch {
    if (depth) {
      return discoverEventualConfigSync(path.dirname(dir), depth - 1);
    }
    return undefined;
  }
}
