import {
  addDeps,
  addDevDeps,
  addTsLib,
  exec,
  modifyTsConfig,
  overrideTsCompilerOptions,
} from "./util";
import path from "path";
import fs from "fs/promises";
import { sampleSSTCode, sampleServiceCode } from "./sample-code";
import { PackageManager } from "./package-manager";

export interface CreateSSTProps {
  projectName: string;
  pkgManager: PackageManager;
}

// TODO support overrides for SST
export async function createAwsSst({
  projectName,
  pkgManager,
}: CreateSSTProps) {
  await exec(
    "npx",
    "create-sst",
    projectName,
    "--template=minimal/typescript-starter"
  );

  process.chdir(path.join(".", projectName));

  await modifyTsConfig(path.join(".", "tsconfig.json"), [
    (tsConfig) =>
      overrideTsCompilerOptions(tsConfig, {
        module: "esnext",
        target: "ES2021",
      }),
  ]);

  await Promise.all([
    addDevDeps(pkgManager, "@eventual/aws-cdk", "@eventual/cli"),
    fs.writeFile(
      path.join(".", "stacks", "MyStack.ts"),
      sampleSSTCode(projectName)
    ),
  ]);

  process.chdir("services");
  await addDeps(pkgManager, "@eventual/core");
  await modifyTsConfig(path.join(".", "tsconfig.json"), [
    (tsConfig) => addTsLib(tsConfig, "DOM"),
    (tsConfig) =>
      overrideTsCompilerOptions(tsConfig, {
        module: "esnext",
        target: "ES2021",
      }),
  ]);

  await Promise.all([
    // Our API relies on the DOM types for node
    fs.rm(path.join(".", "functions", "lambda.ts")),
    fs.writeFile(path.join(".", "functions", "service.ts"), sampleServiceCode),
  ]);
}
