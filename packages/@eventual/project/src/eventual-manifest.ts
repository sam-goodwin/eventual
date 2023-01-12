import { readJsonFile } from "./json-file";
import path from "path";

export interface EventualManifest {
  projectType: "aws-cdk";
}

export const EventualManifestFileName = "eventual.json";

export async function discoverEventualManifest(
  dir = process.cwd()
): Promise<EventualManifest | undefined> {
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
