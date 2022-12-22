import type { PackageManager } from "./index";
import { addDeps, addDevDeps, addTsLib, exec } from "./util";
import path from "path";
import fs from "fs/promises";
import { sampleSSTCode, sampleServiceCode } from "./sample-code";

export async function createAwsSst({
  projectName,
  pkgManager,
}: {
  projectName: string;
  pkgManager: PackageManager;
}) {
  await exec(
    "npx",
    "create-sst",
    projectName,
    "--template=minimal/typescript-starter"
  );

  process.chdir(path.join(".", projectName));
  await addDevDeps(pkgManager, "@eventual/aws-cdk");

  process.chdir("services");
  await addDeps(pkgManager, "@eventual/core");

  await Promise.all([
    // Our API relies on the DOM types for node
    addTsLib(path.join(".", "tsconfig.json"), "DOM"),
    fs.rm(path.join(".", "functions", "lambda.ts")),
    fs.writeFile(path.join(".", "functions", "service.ts"), sampleServiceCode),
    fs.writeFile(path.join(".", "stacks", "MyStack.ts"), sampleSSTCode),
  ]);
}
