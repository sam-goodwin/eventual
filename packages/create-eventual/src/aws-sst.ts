import type { PackageManager } from "./index";
import { addDeps, addDevDeps, exec } from "./util";
import path from "path";

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
}
