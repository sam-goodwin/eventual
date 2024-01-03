import {
  createServicePackage,
  exec,
  install,
  PackageManager,
  writeJsonFile,
} from "@eventual/project";
import fs from "fs/promises";
import path from "path";
import { sampleCDKApp } from "./sample-code.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const version: string = require("../package.json").version;

export interface CreateAwsCdkProps {
  projectName: string;
  pkgManager: PackageManager;
  serviceName: string | undefined;
  git: boolean;
  skipInstall: boolean;
}

export async function createAwsCdkProject({
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

  const basePath = process.cwd();

  const packagesDir = `packages`;
  const serviceDir = path.join(packagesDir, "service");
  const infraDir = `infra`;

  const infraPkgName = `infra`;
  const servicePackageName = `@${serviceName}/service`;

  const workspaceVersion = pkgManager === "pnpm" ? "workspace:^" : "*";

  await createRoot();
  await createService();
  await createInfra();

  async function createRoot() {
    await Promise.all([
      fs.mkdir(path.resolve(basePath, infraDir)),
      fs.mkdir(path.resolve(basePath, serviceDir), {
        recursive: true,
      }),
      fs.writeFile(
        "README.md",
        `# Welcome to your Eventual Project

## Project Structure
The following folder structure will be generated. 
\`\`\`bash
├──infra # an AWS CDK application that deploys the repo's infrastructure
├──packages
    ├──service # the NPM package containing the my-service business logic
\`\`\`

### \`infra\`

This is where you control what infrastructure is deployed with your Service, for example adding DynamoDB Tables, SQS Queues, or other stateful Resources.

### \`packages/service\`

This is where you add business logic such as APIs, Event handlers, Workflows and Tasks.

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
          test: `NODE_OPTIONS=--experimental-vm-modules ${npm("test", {
            workspace: "all",
          })}`,
          watch: "tsc -b -w",
          synth: `tsc -b && ${npm("synth", {
            workspace: "infra",
          })}`,
          deploy: `tsc -b && ${npm("deploy", {
            workspace: "infra",
          })}`,
          hotswap: `tsc -b && ${npm("deploy", {
            workspace: "infra",
            args: ["--hotswap"],
          })}`,
        },
        devDependencies: {
          "@eventual/cli": `^${version}`,
          "@tsconfig/node20": "^1",
          "@types/jest": "^29",
          "@types/node": "^20",
          "aws-cdk": "^2.110.1",
          esbuild: "^0.16.14",
          typescript: "^5",
        },
        ...(pkgManager !== "pnpm"
          ? {
              workspaces: [infraDir, `${packagesDir}/*`],
            }
          : {}),
      }),
      writeJsonFile("tsconfig.base.json", {
        extends: "@tsconfig/node20/tsconfig.json",
        compilerOptions: {
          composite: true,
          declaration: true,
          declarationMap: true,
          inlineSourceMap: true,
          inlineSources: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          resolveJsonModule: true,
          lib: ["ES2022", "WebWorker"],
          types: ["@types/node", "@types/jest"],
        },
      }),
      writeJsonFile("tsconfig.json", {
        files: [],
        references: [
          { path: serviceDir },
          { path: path.join(serviceDir, "tsconfig.test.json") },
          { path: infraDir },
        ],
      }),
      fs.writeFile(
        ".gitignore",
        `lib
node_modules
cdk.out
.eventual
*.tsbuildinfo`
      ),
      pkgManager === "pnpm"
        ? fs.writeFile(
            "pnpm-workspace.yaml",
            `# https://pnpm.io/pnpm-workspace_yaml
packages:
  - "${infraDir}"
  - "${packagesDir}/*"
`
          )
        : Promise.resolve(),
    ]);
  }

  function npm(
    command: string,
    options?: {
      workspace?: "infra" | "service" | "all";
      args?: string[];
    }
  ) {
    return `${pkgManager}${filter()}${prefix()} ${command}${args()}`;

    function filter() {
      if (options?.workspace === undefined) {
        return "";
      } else if (options.workspace === "all") {
        if (pkgManager === "npm") {
          return " -ws --if-present";
        } else if (pkgManager === "yarn") {
          // yarn doesn't have an --if-present
          // TODO: add support for different yarn versions
          return " workspaces";
        } else {
          return " -r";
        }
      } else if (pkgManager === "npm") {
        return ` --workspace=${
          options.workspace === "infra" ? infraDir : serviceDir
        }`;
      } else {
        const workspace = options.workspace;
        if (pkgManager === "yarn") {
          return ` workspace ${workspace}`;
        } else {
          return ` --filter ${workspace}`;
        }
      }
    }

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

  async function createInfra() {
    process.chdir(path.resolve(basePath, infraDir));
    await Promise.all([
      writeJsonFile("tsconfig.json", {
        extends: "../tsconfig.base.json",
        include: ["src"],
        compilerOptions: {
          outDir: "lib",
          rootDir: "src",
          module: "NodeNext",
          target: "ESNext",
          moduleResolution: "NodeNext",
        },
        references: [
          {
            path: `../packages/service`,
          },
        ],
      }),
      writeJsonFile("package.json", {
        name: infraPkgName,
        version: "0.0.0",
        type: "module",
        scripts: {
          synth: "cdk synth",
          deploy: "cdk deploy",
          test: "echo no-op",
        },
        dependencies: {
          "@aws-cdk/aws-apigatewayv2-alpha": "^2.110.1-alpha.0",
          "@aws-cdk/aws-apigatewayv2-authorizers-alpha": "^2.110.1-alpha.0",
          "@aws-cdk/aws-apigatewayv2-integrations-alpha": "^2.110.1-alpha.0",
          "@eventual/aws-cdk": `^${version}`,
          "aws-cdk-lib": "^2.110.1",
          "aws-cdk": "^2.110.1",
          constructs: "^10",
          esbuild: "^0.16.14",
          [servicePackageName]: workspaceVersion,
        },
        devDependencies: {
          "@types/node": "^20",
          "aws-cdk": "^2.110.1",
          tsx: "latest",
          typescript: "^5",
        },
      }),
      writeJsonFile("cdk.json", {
        app: "tsx ./src/app.mts",
      }),

      fs
        .mkdir("src")
        .then(() =>
          Promise.all([
            fs.writeFile(
              path.join("src", "app.mts"),
              sampleCDKApp(serviceName)
            ),
          ])
        ),
    ]);
    process.chdir("..");
  }

  async function createService() {
    await createServicePackage(path.resolve(basePath, serviceDir), {
      packageName: servicePackageName,
      eventualVersion: version,
      src: {
        "index.ts": `/*
The index.ts of your app should export all of the commands, tasks and subscriptions
defined within your service package.
*/
export * from "./hello.js";
`,
        "hello.ts": `import { task, command, event, subscription, workflow } from "@eventual/core";

// create a REST API for: POST /hello <name>
export const hello = command("hello", async (name: string) => {
  const { executionId } = await helloWorkflow.startExecution({
    input: name,
  });

  return { executionId };
})

export const helloWorkflow = workflow("helloWorkflow", async (name: string) => {
  // call a task to format the message
  const message = await formatMessage(name);

  // emit the message to the helloEvent
  await helloEvent.emit({
    message,
  });

  // return the message we created
  return message;
});

// a task that does the work of formatting the message
export const formatMessage = task("formatName", async (name: string) => {
  return \`hello \${name}\`;
});

export const helloEvent = event<HelloEvent>("HelloEvent");

export const onHelloEvent = subscription(
  "onHelloEvent",
  {
    events: [helloEvent],
  },
  async (hello) => {
    console.log("received event", hello);
  }
);

export interface HelloEvent {
  message: string;
}
`,
      },
      test: {
        "hello.test.ts": `import { Execution, ExecutionStatus } from "@eventual/core";
import { TestEnvironment } from "@eventual/testing";
import { createRequire } from "module";
import { helloWorkflow } from "../src/index.js";

const require = createRequire(import.meta.url);

let env: TestEnvironment;

// if there is pollution between tests, call reset()
beforeAll(async () => {
  env = new TestEnvironment();
});

test("hello workflow should emit helloEvent and return message", async () => {
  const execution = await env.startExecution({
    workflow: helloWorkflow,
    input: "name",
  });

  expect((await execution.getStatus()).status).toEqual(
    ExecutionStatus.IN_PROGRESS
  );

  await env.tick();

  expect(await execution.getStatus()).toMatchObject<Partial<Execution<string>>>(
    {
      status: ExecutionStatus.SUCCEEDED,
      result: "hello name",
    }
  );
});
`,
      },
    });
  }

  if (!skipInstall) {
    await install(pkgManager);
  }

  if (git) {
    await exec("git", "add", ".");
    await exec("git", "commit", "-m", `"initial commit"`);
  }
}
