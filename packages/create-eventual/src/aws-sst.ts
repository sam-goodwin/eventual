import type { PackageManager } from "./index";
import { addDeps, addDevDeps, exec } from "./util";

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

  process.chdir(`./${projectName}`);

  await addDeps(pkgManager, "@eventual/core", "@eventual/aws-runtime");
  await addDevDeps(pkgManager, "@eventual/aws-cdk");
}
