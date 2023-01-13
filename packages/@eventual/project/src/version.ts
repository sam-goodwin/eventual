import fs from "fs/promises";

export async function discoverEventualVersion() {
  const version = JSON.parse(
    (await fs.readFile("package.json")).toString("utf-8")
  ).devDependencies["@eventual/cli"];

  if (typeof version !== "string") {
    throw new Error(`Cannot determine version of Eventual`);
  }

  return version;
}
