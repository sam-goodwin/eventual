import { readJsonFile } from "./json-file.js";
import path from "path";

export interface EventualConfig {
  projectType: "aws-cdk";
  synth: string;
  deploy: string;
}

export const EventualManifestFileName = "eventual.json";

export async function discoverEventualConfig(
  dir = process.cwd()
): Promise<EventualConfig | undefined> {
  try {
    const filePath = path.join(dir, EventualManifestFileName);
    const file = await readJsonFile(filePath);
    if ("projectType" in file) {
      if (file.projectType === "aws-cdk") {
        return file;
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
    return undefined;
  }
}
