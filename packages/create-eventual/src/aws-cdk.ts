import fs from "fs/promises";
import path from "path";
import { sampleCDKApp, sampleCDKStack, sampleServiceCode } from "./sample-code";
import { CreateProps, install } from "./util";

export async function createAwsCdk({ projectName, pkgManager }: CreateProps) {
  await fs.mkdir(projectName);
  process.chdir(projectName);

  const pkgJson = JSON.parse(
    (await fs.readFile(path.join(__dirname, "..", "package.json"))).toString(
      "utf-8"
    )
  );
  const version = pkgJson.version as number;

  const servicesDirName = `services`;
  const servicesPkgName = `@${projectName}/services`;
  const stacksDirName = `stacks`;
  const stacksPkgName = `@${projectName}/stacks`;
  const servicesDir = path.resolve(process.cwd(), servicesDirName);
  const infraDir = path.resolve(process.cwd(), stacksDirName);

  await createRoot();
  await createServices();
  await createInfra();

  async function createRoot() {
    await Promise.all([
      fs.mkdir(infraDir),
      fs.mkdir(servicesDir),
      writeJsonFile("package.json", {
        name: `${projectName}-monorepo`,
        private: true,
        scripts: {
          build: "tsc -b",
          watch: "tsc -b -w",
          synth: run("synth"),
          deploy: run("deploy"),
        },
        devDependencies: {
          "@eventual/cli": `^${version}`,
          "@tsconfig/node16": "^1",
        },
        ...(pkgManager !== "pnpm"
          ? {
              workspaces: [servicesDirName, stacksDirName],
            }
          : {}),
      }),
      writeJsonFile("tsconfig.base.json", {
        extends: "@tsconfig/node16/tsconfig.json",
        compilerOptions: {
          composite: true,
          declaration: true,
          declarationMap: true,
          inlineSourceMap: true,
          inlineSources: true,
        },
      }),
      writeJsonFile("tsconfig.json", {
        files: [],
        references: [
          //
          { path: servicesDirName },
          { path: stacksDirName },
        ],
      }),

      fs.writeFile(
        ".gitignore",
        `lib
node_modules
cdk.out
.eventual`
      ),
      pkgManager === "pnpm"
        ? fs.writeFile(
            "pnpm-workspace.yaml",
            `# https://pnpm.io/pnpm-workspace_yaml
packages:
  - "services"
`
          )
        : Promise.resolve(),
    ]);
  }

  // creates a run script that is package aware
  function run(script: string) {
    return pkgManager === "npm"
      ? `npm run ${script} --workspace=${stacksDirName}`
      : pkgManager === "yarn"
      ? `yarn workspace ${stacksPkgName} ${script}`
      : `pnpm run ${script} --filter ${stacksPkgName}`;
  }

  async function createInfra() {
    process.chdir(infraDir);
    await Promise.all([
      writeJsonFile("package.json", {
        name: stacksPkgName,
        version: "0.0.0",
        scripts: {
          synth: "cdk synth",
          deploy: "cdk deploy",
        },
        dependencies: {
          "@eventual/aws-cdk": `^${version}`,
          "@eventual/aws-runtime": `^${version}`,
          "aws-cdk-lib": "^2.50.0",
          "aws-cdk": "^2.50.0",
          constructs: "^10",
          esbuild: "^0.16.13",
        },
        devDependencies: {
          "@eventual/cli": `^${version}`,
          "ts-node": "^10.9.1",
          typescript: "^4.9.4",
        },
      }),
      writeJsonFile("cdk.json", {
        app: "ts-node ./src/app.ts",
      }),
      writeJsonFile("tsconfig.json", {
        extends: "../tsconfig.base.json",
        include: ["src"],
        compilerOptions: {
          outDir: "lib",
          rootDir: "src",
        },
      }),
      fs
        .mkdir("src")
        .then(() =>
          Promise.all([
            fs.writeFile(path.join("src", "app.ts"), sampleCDKApp(projectName)),
            fs.writeFile(
              path.join("src", `${projectName}-stack.ts`),
              sampleCDKStack(projectName)
            ),
          ])
        ),
    ]);
    process.chdir("..");
  }

  async function createServices() {
    process.chdir(servicesDir);
    await Promise.all([
      writeJsonFile(path.join(servicesDir, "package.json"), {
        name: servicesPkgName,
        type: "module",
        version: "0.0.0",
        dependencies: {
          "@eventual/core": `^${version}`,
        },
      }),
      fs
        .mkdir("src")
        .then(() =>
          fs.writeFile(path.join("src", "index.ts"), sampleServiceCode)
        ),
      writeJsonFile("tsconfig.json", {
        extends: "../tsconfig.base.json",
        include: ["src"],
        compilerOptions: {
          lib: ["DOM"],
          module: "esnext",
          moduleResolution: "node",
          outDir: "lib",
          rootDir: "src",
          target: "ES2021",
        },
      }),
    ]);
    process.chdir("..");
  }

  await install(pkgManager);
}

async function writeJsonFile(file: string, obj: any) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}
