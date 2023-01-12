import {
  createServicePackage,
  exec,
  install,
  PackageManager,
  validateServiceName,
  version,
  writeJsonFile,
} from "@eventual/project";
import fs from "fs/promises";
import inquirer from "inquirer";
import path from "path";
import { sampleCDKApp } from "./sample-code";

export interface CreateAwsCdkProps {
  projectName: string;
  pkgManager: PackageManager;
  serviceName: string | undefined;
}

export async function createAwsCdkProject({
  projectName,
  pkgManager,
  serviceName,
}: CreateAwsCdkProps) {
  if (serviceName === undefined) {
    const response = await inquirer.prompt([
      {
        type: "input",
        name: "serviceName",
        message: "service name",
        validate: validateServiceName,
      },
    ]);
    serviceName = response.serviceName! as string;
  }

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
          deploy: run("deploy"),
          hotswap: run("deploy", "--hotswap"),
        },
        devDependencies: {
          "@eventual/cli": `^${version}`,
          "@tsconfig/node16": "^1",
          "@types/node": "^16",
          esbuild: "^0.16.14",
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
    message
  });

  // return the message we created
  return message;
});

// an activity that does the work of formatting the message
export const formatMessage = activity("formatName", async (name: string) => {
  return \`hello \${name}\`;
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
