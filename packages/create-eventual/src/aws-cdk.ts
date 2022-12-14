import fs from "fs/promises";
import type { PackageManager } from "./index";
import { addDeps, addDevDeps, exec } from "./util";

export async function createAwsCdk({
  projectName,
  pkgManager,
}: {
  projectName: string;
  pkgManager: PackageManager;
}) {
  await fs.mkdir(projectName);
  process.chdir(projectName);

  await exec("npx", "cdk", "init", "app", "--language=typescript");

  await addDeps(pkgManager, "@eventual/core", "@eventual/aws-runtime");
  await addDevDeps(pkgManager, "@eventual/aws-cdk");
}
