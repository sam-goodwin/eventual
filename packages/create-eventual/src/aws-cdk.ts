import fs from "fs/promises";
import path from "path";
import type { PackageManager } from "./index";
import { sampleCDKApp, sampleCDKStack, sampleServiceCode } from "./sample-code";
import { addDeps, addDevDeps, install } from "./util";

export async function createAwsCdk({
  projectName,
  pkgManager,
}: {
  projectName: string;
  pkgManager: PackageManager;
}) {
  await fs.mkdir(projectName);
  process.chdir(projectName);

  await Promise.all([
    writeJsonFile("package.json", {
      name: projectName,
      version: "0.0.0",
      scripts: {
        build: "tsc -b",
        watch: "tsc -w",
        synth: "cdk synth",
        deploy: "cdk deploy",
      },
    }),
    writeJsonFile("cdk.json", {
      app: "ts-node ./src/app.ts",
    }),
    writeJsonFile("tsconfig.json", {
      extends: "@tsconfig/node16/tsconfig.json",
      include: ["src"],
      compilerOptions: {
        outDir: "lib",
        declaration: true,
      },
      references: [{ path: "./services/tsconfig.json" }],
    }),
    fs.writeFile(
      ".gitignore",
      `lib
node_modules`
    ),
    fs
      .mkdir("src")
      .then(() =>
        Promise.all([
          fs.writeFile(path.join("src", "app.ts"), sampleCDKApp),
          fs.writeFile(path.join("src", "my-stack.ts"), sampleCDKStack),
        ])
      ),
  ]);

  await addDevDeps(
    pkgManager,
    "@eventual/aws-cdk",
    "@eventual/aws-runtime",
    "@eventual/cli",
    "@tsconfig/node16",
    "aws-cdk-lib",
    "constructs@^10",
    "esbuild",
    "ts-node",
    "typescript"
  );
  await install(pkgManager);

  await fs.mkdir("services");
  process.chdir("services");
  await Promise.all([
    fs
      .mkdir("src")
      .then(() =>
        fs.writeFile(path.join("src", "my-service.ts"), sampleServiceCode)
      ),
    writeJsonFile("package.json", {
      name: `@${projectName}/services`,
      version: "0.0.0",
    }),
    writeJsonFile("tsconfig.json", {
      extends: "../tsconfig.json",
      include: ["src"],
      compilerOptions: {
        baseUrl: ".",
        composite: true,
        lib: ["DOM"],
        module: "esnext",
        moduleResolution: "node",
        outDir: "lib",
        target: "ES2021",
      },
    }),
  ]);
  await addDeps(pkgManager, "@eventual/core");
  await install(pkgManager);
  process.chdir("..");
}

async function writeJsonFile(file: string, obj: any) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}
