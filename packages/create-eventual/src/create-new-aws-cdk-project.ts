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
}

export async function createAwsCdkProject({
  projectName,
  pkgManager,
  serviceName = projectName,
}: CreateAwsCdkProps) {
  await fs.mkdir(projectName);
  process.chdir(projectName);
  await exec("git", "init");

  const appsDirName = `apps`;
  const appsDir = path.resolve(process.cwd(), appsDirName);
  const serviceDir = path.resolve(appsDir, serviceName);
  const packagesDirName = `packages`;
  const infraDirName = `infra`;
  const infraPkgName = `infra`;
  const infraDir = path.resolve(process.cwd(), infraDirName);
  const eventsDir = path.resolve(process.cwd(), packagesDirName, "events");

  const workspaceVersion = pkgManager === "pnpm" ? "workspace:^" : "*";

  await createRoot();
  await createService();
  await createInfra();
  await createEvents();

  async function createRoot() {
    await Promise.all([
      fs.mkdir(infraDir),
      fs.mkdir(serviceDir, {
        recursive: true,
      }),
      fs.mkdir(eventsDir, {
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
    ├──${serviceName} # the NPM package containing the my-service business logic
├──packages
    ├──events # a shared NPM package containing event definitions
\`\`\`

### \`infra\`

This is where you control what infrastructure is deployed with your Service, for example adding DynamoDB Tables, SQS Queues, or other stateful Resources.

### \`apps/${serviceName}\`

This is where you add business logic such as APIs, Event handlers, Workflows and Activities.

### \`packages/events\`

The \`packages/\` directory is where you can place any shared packages containing code that you want to use elsewhere in the repo, such as \`apps/${serviceName}\`.

The template includes an initial \`events\` package where you may want to place the type definitions of your events.

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

### Build

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
          watch: "tsc -b -w",
          synth: run("synth"),
          deploy: `tsc -b && ${run("deploy")}`,
          hotswap: `tsc -b && ${run("deploy", "--hotswap")}`,
        },
        devDependencies: {
          "@eventual/cli": `^${version}`,
          "@tsconfig/node16": "^1",
          "@types/node": "^16",
          esbuild: "^0.16.14",
          typescript: "^4.9.4",
        },
        ...(pkgManager !== "pnpm"
          ? {
              workspaces: [
                `${appsDirName}/*`,
                infraDirName,
                `${packagesDirName}/*`,
              ],
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
          resolveJsonModule: true,
          types: ["@types/node"],
        },
      }),
      writeJsonFile("tsconfig.json", {
        files: [],
        references: [
          { path: `${appsDirName}/${serviceName}` },
          { path: infraDirName },
          { path: `${packagesDirName}/events` },
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
  - "${appsDirName}/*"
  - "${infraDirName}"
  - "${packagesDirName}/*"
`
          )
        : Promise.resolve(),
    ]);
  }

  function npm(command: string, ...args: string[]) {
    return `${pkgManager}${needsRunPrefix() ? " run" : ""} ${command}${
      args.length > 0 ? ` ${args.join(" ")}` : ""
    }`;

    function needsRunPrefix() {
      return (
        (pkgManager === "pnpm" && command === "deploy") || pkgManager === "npm"
      );
    }
  }

  // creates a run script that is package aware
  function run(script: string, ...args: any[]) {
    return `${
      pkgManager === "npm"
        ? `npm run ${script} --workspace=${infraDirName}`
        : pkgManager === "yarn"
        ? `yarn workspace ${infraPkgName} ${script}`
        : `pnpm --filter ${infraPkgName} ${
            script === "deploy" ? "run deploy" : script
          }`
    }${
      args.length > 0
        ? `${`${pkgManager === "npm" ? " --" : ""}`} ${args.join(" ")}`
        : ""
    }`;
  }

  async function createInfra() {
    process.chdir(infraDir);
    await Promise.all([
      writeJsonFile("tsconfig.json", {
        extends: "../tsconfig.base.json",
        include: ["src"],
        compilerOptions: {
          outDir: "lib",
          rootDir: "src",
        },
        references: [
          {
            path: `../apps/${serviceName}`,
          },
        ],
      }),
      writeJsonFile("package.json", {
        name: infraPkgName,
        version: "0.0.0",
        scripts: {
          synth: "cdk synth",
          deploy: "cdk deploy",
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
          [serviceName!]: workspaceVersion,
        },
        devDependencies: {
          "@types/node": "^16",
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
      entry: require.resolve("${serviceName}")
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
    await createServicePackage(path.resolve(serviceDir), {
      packageName: serviceName!,
      eventualVersion: version,
      references: ["../../packages/events"],
      dependencies: {
        [`@${projectName}/events`]: workspaceVersion,
      },
      code: `import { activity, api, workflow } from "@eventual/core";

// import a shared definition of the helloEvent
import { helloEvent } from "@${projectName}/events";

// create a REST API for: POST /hello <name>
api.post("/hello", async (request) => {
  const name = await request.text();

  const { executionId } = await helloWorkflow.startExecution({
    input: name,
  });

  return new Response(JSON.stringify({ executionId }));
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

helloEvent.onEvent((hello) => {
  console.log("received event", hello);
});
`,
    });
  }

  async function createEvents() {
    process.chdir(eventsDir);
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
        name: `@${projectName}/events`,
        version: "0.0.0",
        private: true,
        type: "module",
        main: "lib/index.js",
        types: "lib/index.d.ts",
        module: "lib/index.js",
        peerDependencies: {
          "@eventual/core": `^${version}`,
        },
        devDependencies: {
          "@eventual/core": version,
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
    ]);
    process.chdir("..");
  }

  await install(pkgManager);
}
