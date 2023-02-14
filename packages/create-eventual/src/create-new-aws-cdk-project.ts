import {
  createServicePackage,
  exec,
  install,
  PackageManager,
  writeJsonFile,
} from "@eventual/project";
import fs from "fs/promises";
import path from "path";
import { sampleCDKApp } from "./sample-code";

const version: string = require("../package.json").version;

export interface CreateAwsCdkProps {
  projectName: string;
  pkgManager: PackageManager;
  serviceName: string | undefined;
  git: boolean;
}

export async function createAwsCdkProject({
  projectName,
  pkgManager,
  serviceName = projectName,
  git,
}: CreateAwsCdkProps) {
  await fs.mkdir(projectName);
  process.chdir(projectName);
  if (git) {
    await exec("git", "init");
  }

  const basePath = process.cwd();

  const appsDir = `apps`;
  const serviceDir = path.join(appsDir, "service");
  const packagesDir = `packages`;
  const coreDir = path.join(packagesDir, "core");
  const infraDir = `infra`;

  const infraPkgName = `infra`;
  const corePackageName = `@${serviceName}/core`;
  const servicePackageName = `@${serviceName}/service`;

  const workspaceVersion = pkgManager === "pnpm" ? "workspace:^" : "*";

  await createRoot();
  await createService();
  await createInfra();
  await createCore();

  async function createRoot() {
    await Promise.all([
      fs.mkdir(path.resolve(basePath, infraDir)),
      fs.mkdir(path.resolve(basePath, serviceDir), {
        recursive: true,
      }),
      fs.mkdir(path.resolve(basePath, coreDir), {
        recursive: true,
      }),
      fs.writeFile(
        "README.md",
        `# Welcome to your Eventual Project

## Project Structure
The following folder structure will be generated. 
\`\`\`bash
├──infra # an AWS CDK application that deploys the repo's infrastructure
├──apps
    ├──service # the NPM package containing the my-service business logic
├──packages
    ├──core # a shared NPM package containing event and type definitions
\`\`\`

### \`infra\`

This is where you control what infrastructure is deployed with your Service, for example adding DynamoDB Tables, SQS Queues, or other stateful Resources.

### \`apps/service\`

This is where you add business logic such as APIs, Event handlers, Workflows and Activities.

### \`packages/core\`

The \`packages/\` directory is where you can place any shared packages containing code that you want to use elsewhere in the repo, such as \`apps/service}\`.

The template includes an initial \`core\` package where you may want to place the type, events, and other shared resources.

## Deployed Infrastructure

After deploying to AWS, you'll have a single stack named \`${serviceName}\` containing your Service. Take a look at the structure using the Resources view in CloudFormation. Here, you can find a list of all the Lambda Functions and other Resources that come with a Service.

See the [Service documentation](https://docs.eventual.net/reference/service) for more information.

### Noteworthy Lambda Functions

* \`${serviceName}\-api-handler\` - the Lambda Function that handles any API routes, see [API](https://docs.eventual.net/reference/api).
* \`${serviceName}\-event-handler\` - the Lambda Function that handles any Event subscriptions, see [Event](https://docs.eventual.net/reference/event).
* \`${serviceName}\-activity-handler\` - the Lambda Function that handles any Activity invocations, see [Activity](https://docs.eventual.net/reference/activity).
* \`${serviceName}\-orchestrator-handler\` - the Lambda Function that orchestrates Workflow Executions, see [Workflow](https://docs.eventual.net/reference/workflow).

### Viewing the Logs

The following CloudWatch LogGroups are useful for seeing what's happening in your Service.
* \`${serviceName}-execution-logs\` - contains a single LogStream per Workflow Execution containing all logs from the \`workflow\` and \`activity\` functions. This is a good place to see the logs for a single execution in one place, including any logs from a workflow and any activities it invokes.
* \`${serviceName}-api-handler\` - the API handler Lambda Function's logs, see [API](https://docs.eventual.net/reference/api).
* \`${serviceName}-event-handler\` - the Event handler Lambda Function's logs, see [Events](https://docs.eventual.net/reference/event)
* \`${serviceName}-orchestrator\` - system logs of the Workflow Orchestrator function.

## Scripts

The root \`package.json\` contains some scripts for your convenience.

### Build

The \`build\` script compiles all TypeScript (\`.ts\`) files in each package's \`src/\` directory and emits the compiled output in the corresponding \`lib/\` folder.

\`\`\`
${npm("build")}
\`\`\`

### Test

The \`test\` script runs \`jest\` in all sub-packages. Check out the apps/service package for example tests.

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
          "@tsconfig/node18": "^1",
          "@types/jest": "^29",
          "@types/node": "^18",
          esbuild: "^0.16.14",
          typescript: "^4.9.4",
        },
        ...(pkgManager !== "pnpm"
          ? {
              workspaces: [`${appsDir}/*`, infraDir, `${packagesDir}/*`],
            }
          : {}),
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
          { path: coreDir },
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
  - "${appsDir}/*"
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
      workspace?: "infra" | "service" | "core" | "all";
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
          options.workspace === "infra"
            ? infraDir
            : options.workspace === "core"
            ? coreDir
            : serviceDir
        }`;
      } else {
        const workspace =
          options.workspace === "core" ? corePackageName : options.workspace;
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
          module: "CommonJS",
          moduleResolution: "Node",
        },
        references: [
          {
            path: `../apps/service`,
          },
        ],
      }),
      writeJsonFile("package.json", {
        name: infraPkgName,
        version: "0.0.0",
        scripts: {
          synth: "cdk synth",
          deploy: "cdk deploy",
          test: "echo no-op",
        },
        dependencies: {
          "@aws-cdk/aws-apigatewayv2-alpha": "^2.50.0-alpha.0",
          "@aws-cdk/aws-apigatewayv2-authorizers-alpha": "^2.50.0-alpha.0",
          "@aws-cdk/aws-apigatewayv2-integrations-alpha": "^2.50.0-alpha.0",
          "@eventual/aws-cdk": `^${version}`,
          "aws-cdk-lib": "^2.50.0",
          "aws-cdk": "^2.50.0",
          constructs: "^10",
          esbuild: "^0.16.14",
          [servicePackageName]: workspaceVersion,
        },
        devDependencies: {
          "@types/node": "^18",
          "aws-cdk": "^2.50.0",
          "ts-node": "^10.9.1",
          typescript: "^4.9.4",
        },
      }),
      writeJsonFile("cdk.json", {
        app: "ts-node ./src/app.ts",
      }),

      fs.mkdir("src").then(() =>
        Promise.all([
          fs.writeFile(path.join("src", "app.ts"), sampleCDKApp(projectName)),
          fs.writeFile(
            path.join("src", `${projectName}-stack.ts`),
            `import { Construct } from "constructs";
import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Service } from "@eventual/aws-cdk";

export interface MyServiceStackProps extends StackProps {}

export class MyServiceStack extends Stack {
  public readonly service: Service;

  constructor(scope: Construct, id: string, props?: MyServiceStackProps) {
    super(scope, id, props);

    this.service = new Service(this, "${serviceName}", {
      name: "${serviceName}",
      entry: require.resolve("${servicePackageName}")
    });

    new CfnOutput(this, "${serviceName}-api-endpoint", {
      exportName: "${serviceName}-api-endpoint",
      value: this.service.api.gateway.url!,
    });

    new CfnOutput(this, "${serviceName}-event-bus-arn", {
      exportName: "${serviceName}-event-bus-arn",
      value: this.service.events.bus.eventBusArn,
    });
  }
}
`
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
      references: [`../../${coreDir}`],
      dependencies: {
        [corePackageName]: workspaceVersion,
      },
      src: {
        "index.ts": `import { activity, api, HttpResponse, workflow } from "@eventual/core";

// import a shared definition of the helloEvent
import { helloEvent } from "${corePackageName}";

// create a REST API for: POST /hello <name>
api.post("/hello", async (request) => {
  const name = await request.text();

  const { executionId } = await helloWorkflow.startExecution({
    input: name,
  });

  return new HttpResponse(JSON.stringify({ executionId }));
});

export const helloWorkflow = workflow("helloWorkflow", async (name: string) => {
  // call an activity to format the message
  const message = await formatMessage(name);

  // publish the message to the helloEvent
  await helloEvent.publishEvents({
    message,
  });

  // return the message we created
  return message;
});

// an activity that does the work of formatting the message
export const formatMessage = activity("formatName", async (name: string) => {
  return \`hello \${name}\`;
});

helloEvent.onEvent("onHelloEvent", async (hello) => {
  console.log("received event", hello);
});
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
  env = new TestEnvironment({
    entry: require.resolve("../src"),
  });

  await env.initialize();
});

test("hello workflow should publish helloEvent and return message", async () => {
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

  async function createCore() {
    process.chdir(path.resolve(basePath, coreDir));
    await Promise.all([
      fs.mkdir("src").then(() =>
        Promise.all([
          fs.writeFile(
            path.join("src", "index.ts"),
            `export * from "./hello-event.js"\n`
          ),
          fs.writeFile(
            path.join("src", "hello-event.ts"),
            `import { event } from "@eventual/core";

export interface HelloEvent {
  message: string;
}

export const helloEvent = event<HelloEvent>("HelloEvent");
`
          ),
        ])
      ),
      writeJsonFile("package.json", {
        name: corePackageName,
        version: "0.0.0",
        private: true,
        type: "module",
        main: "lib/index.js",
        types: "lib/index.d.ts",
        module: "lib/index.js",
        scripts: {
          test: "jest --passWithNoTests",
        },
        peerDependencies: {
          "@eventual/core": `^${version}`,
        },
        devDependencies: {
          "@eventual/core": version,
          jest: "^29",
          "ts-jest": "^29",
          typescript: "^4.9.4",
        },
        jest: {
          extensionsToTreatAsEsm: [".ts"],
          moduleNameMapper: {
            "^(\\.{1,2}/.*)\\.js$": "$1",
          },
          transform: {
            "^.+\\.(t|j)sx?$": [
              "ts-jest",
              {
                tsconfig: "tsconfig.test.json",
                useESM: true,
              },
            ],
          },
        },
      }),
      writeJsonFile("tsconfig.json", {
        extends: "../../tsconfig.base.json",
        include: ["src"],
        compilerOptions: {
          lib: ["DOM"],
          module: "esnext",
          moduleResolution: "NodeNext",
          outDir: "lib",
          rootDir: "src",
          target: "ES2021",
        },
      }),
      writeJsonFile("tsconfig.test.json", {
        extends: "./tsconfig.json",
        include: ["src", "test"],
        exclude: ["lib", "node_modules"],
        compilerOptions: {
          noEmit: true,
          rootDir: ".",
        },
      }),
    ]);
    process.chdir("..");
  }

  await install(pkgManager);
}
