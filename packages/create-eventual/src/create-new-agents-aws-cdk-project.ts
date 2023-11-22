import {
  exec,
  install,
  PackageManager,
  writeJsonFile,
} from "@eventual/project";
import fs from "fs/promises";
import path from "path";
import { sampleCDKApp } from "./sample-code";
import { readSample } from "./read-sample";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const version: string = require("../package.json").version;

export interface CreateAwsCdkProps {
  projectName: string;
  pkgManager: PackageManager;
  serviceName: string | undefined;
  git: boolean;
  skipInstall: boolean;
}

export async function createAgentsAwsCdkProject({
  projectName,
  pkgManager,
  serviceName = projectName,
  git,
  skipInstall,
}: CreateAwsCdkProps) {
  await fs.mkdir(projectName);
  process.chdir(projectName);
  if (git) {
    await exec("git", "init");
  }

  await Promise.all([
    fs.writeFile(
      "README.md",
      `# Welcome to your Eventual Agents Project

## Project Structure
The following folder structure will be generated. 
\`\`\`bash
src/
├── infra.ts # the AWS infrastructure for your Service
├── index.ts # the entrypoint for your Service
└── agent.ts # your first agent implementation
\`\`\`

## Deployed Infrastructure

After deploying to AWS, you'll have a single stack named \`${serviceName}\` containing your Service. Take a look at the structure using the Resources view in CloudFormation. Here, you can find a list of all the Lambda Functions and other Resources that come with a Service.

See the [Service documentation](https://docs.eventual.ai/reference/service) for more information.

## Scripts

The root \`package.json\` contains some scripts for your convenience.

### Build

The \`build\` script compiles all TypeScript (\`.ts\`) files in each package's \`src/\` directory and emits the compiled output in the corresponding \`lib/\` folder.

\`\`\`
${npm("build")}
\`\`\`

### Test

The \`test\` script runs \`jest\` in all sub-packages. Check out the packages/service package for example tests.

\`\`\`
${npm("test")}
\`\`\`

### Watch

The \`watch\` script run the typescript compiler in the background and re-compiles \`.ts\` files whenever they are changed.
\`\`\`
${npm("watch")}
\`\`\`

### Synth

The \`synth\` script synthesizes the CDK application in the \`infra/\` package. 
\`\`\`
${npm("synth")}
\`\`\`

### Deploy

The \`deploy\` script synthesizes and deploys the CDK application in the \`infra/\` package to AWS.
\`\`\`
${npm("deploy")}
\`\`\`

### Hotswap

The \`hotswap\` script synthesizes and deploys the CDK application in the \`infra/\` package to AWS using \`cdk deploy --hotswap\` which can bypass a slow CloudFormation deployment in cases where only the business logic in a Lambda Function has changed.
\`\`\`
${npm("deploy")}
\`\`\`
`
    ),
    writeJsonFile("eventual.json", {
      projectType: "aws-cdk",
      synth: "pnpm synth",
      deploy: "pnpm run deploy --require-approval never",
    }),
    writeJsonFile("package.json", {
      name: projectName,
      version: "0.0.0",
      private: true,
      scripts: {
        build: "tsc -b",
        test: `NODE_OPTIONS=--experimental-vm-modules jest`,
        synth: "cdk synth",
        deploy: "cdk deploy",
        hotswap: `tsc -b && ${npm("deploy", {
          args: ["--hotswap"],
        })}`,
      },
      dependencies: {
        "@eventual/core": `^${version}`,
        openai: "latest",
        zod: "latest",
      },
      devDependencies: {
        "@aws-cdk/aws-apigatewayv2-alpha": "^2.102.0-alpha.0",
        "@aws-cdk/aws-apigatewayv2-authorizers-alpha": "^2.102.0-alpha.0",
        "@aws-cdk/aws-apigatewayv2-integrations-alpha": "^2.102.0-alpha.0",
        "@eventual/aws-cdk": `^${version}`,
        "@eventual/cli": `^${version}`,
        "@tsconfig/node18": "^1",
        "@types/jest": "^29",
        "@types/node": "^18",
        "aws-cdk-lib": "^2.102.0",
        "aws-cdk": "^2.102.0",
        "ts-node": "^10.9.1",
        constructs: "^10",
        esbuild: "^0.16.14",
        typescript: "^5",
      },
    }),
    writeJsonFile("tsconfig.base.json", {
      extends: "@tsconfig/node18/tsconfig.json",
      compilerOptions: {
        composite: true,
        declaration: true,
        declarationMap: true,
        inlineSourceMap: true,
        inlineSources: true,
        module: "esnext",
        moduleResolution: "NodeNext",
        target: "ESNext",
        resolveJsonModule: true,
        lib: ["ES2022", "WebWorker"],
        types: ["@types/node", "@types/jest"],
      },
    }),
    writeJsonFile("tsconfig.json", {
      extends: "./tsconfig.base.json",
      include: ["src"],
      compilerOptions: {
        outDir: "lib",
      },
    }),
    writeJsonFile("tsconfig.test.json", {
      extends: "./tsconfig.base.json",
      include: ["src", "test"],
      compilerOptions: {
        noEmit: true,
      },
    }),
    writeJsonFile("cdk.json", {
      app: "ts-node-esm ./src/app.mts",
    }),
    fs
      .mkdir("src")
      .then(() =>
        Promise.all([
          fs.writeFile(path.join("src", "app.ts"), sampleCDKApp(serviceName)),
          fs.writeFile(path.join("src", "index.ts"), sampleCDKApp(serviceName)),
          fs.writeFile(path.join("src", "agent.ts"), readSample("agent")),
        ])
      ),
    fs.writeFile(
      ".gitignore",
      `lib
node_modules
cdk.out
.eventual
*.tsbuildinfo`
    ),
  ]);

  function npm(
    command: string,
    options?: {
      workspace?: "infra" | "service" | "all";
      args?: string[];
    }
  ) {
    return `${pkgManager}${prefix()} ${command}${args()}`;

    function prefix() {
      return (pkgManager === "pnpm" && command === "deploy") ||
        pkgManager === "npm"
        ? " run"
        : options?.workspace === "all"
        ? " run"
        : "";
    }

    function args() {
      return options?.args?.length ? ` ${options.args.join(" ")}` : "";
    }
  }

  if (!skipInstall) {
    await install(pkgManager);
  }

  if (git) {
    await exec("git", "add", ".");
    await exec("git", "commit", "-m", `"initial commit"`);
  }
}
