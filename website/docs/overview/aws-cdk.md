---
title: AWS Cloud Development Kit
---

# AWS CDK Project Overview

To create a new AWS CDK project with Eventual, run the below command:

```sh
npm create eventual <project-name> --target aws-cdk
```

## Overview of the Template

An AWS CDK project structure contains a mono repo consisting of a root NPM package, a workspace configuration pointing to two nested packages:

1. the Stacks package (for your infrastructure configuration)
2. the Services package (for your business logic)

### Root Package

The root of the NPM package is a mono repo using NPM, Yarn or PNPM workspaces.

```sh
services/ # NPM package containing business logic
stacks/ # NPM package containing AWS CDK infrastructure code
tsconfig.base.json # base tsconfig of the services/ and stacks/ NPM packages
tsconfig.json # root tsconfig.json referencing services/ and stacks/
package.json # root package.json with repo-wide dependencies and scripts
```

### Workspace Configuration

We use workspaces to support having multiple NPM packages within a single project and sharing dependencies and automatically linking intra-repo dependencies. It is a scalable approach to building services as you will be able to easily add more packages as your application grows.

If you're using NPM or Yarn, then your `package.json` will contain the following configuration:

```json
{
  // treat the services/ and stacks/ directory as NPM/Yarn workspaces
  "workspaces": ["services", "stacks"]
}
```

If you're using NPM, then another file, `pnpm-workspace.yaml` will be present in the root containing:

```yml
# https://pnpm.io/pnpm-workspace_yaml
packages:
  - "services"
  - "stacks"
```

### Scripts

For convenience, the root package contains the following scripts:

- `build` - compiles the TypeScript code in both the services/ and stacks/ NPM packages
- `watch` - runs a watch script to compile code in both the services/ and stacks/ NPM packages whenever a file is changed
- `synth` - synthesizes the AWS CDK application within the stacks/ NPM package to CloudFormation
- `deploy` - deploys the AWS CDK application within the stacks/ NPM package to AWS

### Stacks package

The Stacks package is where you configure your infrastructure.

```sh
stacks/
  package.json
  tsconfig.json
  cdk.json
  src/
    app.ts # the CDK application entrypoint
    my-stack.ts # your service's Stack
```

The template creates an initial file, `stack.ts`, which provides a class, `MyServiceStack` that extends `Stack` and instantiates a single Eventual `Service`.

```ts
import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { Service } from "@eventual/aws-cdk";

export interface MyServiceStackProps extends StackProps {}

export class MyServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: MyServiceStackProps) {
    super(scope, id, props);

    const service = new Service(this, "Service", {
      name: "my-service",
      entry: path.join(
        __dirname,
        "..",
        "..",
        "services",
        "src",
        "my-service.ts"
      ),
    });
  }
}
```

`MyServiceStack` is then instantiated within `app.ts` which is your application's entrypoint:

```ts
import { App, Stack } from "aws-cdk-lib";
import path from "path";
import { MyServiceStack } from "./my-stack";

const app = new App();

new MyServiceStack(app, "my-stack");
```

When you run `cdk deploy`, the CDK will run your program starting with `app.ts` as configured in `cdk.json`:

```json
{
  "app": "ts-node ./src/app.ts"
}
```

### Services package

The Services package within the folder, `services`, contains the application logic for your service. It has the following structure:

```sh
services/
  package.json
  tsconfig.json
  src/
    index.ts # the Eventual service entrypoint
```

The template creates an initial file, `src/index.ts`, that contains a basic example application touching on each of the 4 Eventual primitives, `api`, `event`, `workflow` and `activity`.

## Drop in to existing Project

If you're already a user of the AWS CDK and wish to begin using Eventual as a part of an existing project, you can import the `Service` Construct directly from `@eventual/aws-cdk` and incorporate it into your Stacks.

```ts
import { Service } from "@eventual/aws-cdk";
```

Then, instantiate the `Service` within a Stack and point it at the file containing your business logic.

```ts
class MyServiceStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new Service(this, "MyService", {
      // resolve the path of the .ts (or .js) file containing your service code
      entry: path.resolve(
        __dirname,
        "..",
        "services",
        "functions",
        "service.ts"
      ),
    });
  }
}
```

### Services Package Configuration

The `services` package is where you should store your business logic code. It is recommended to create a package within the infrastructure package, as shown below:

```
services/
  src/
    service.ts // your service's entrypoint
  package.json
  tsconfig.json
```

To take advantage of ESM modules and tree-shaking, make sure to set `type: "module"` in the `package.json` file. This will result in smaller cold starts and lower memory usage.

```json
{
  "type": "module",
  "dependencies": {
    "@eventual/core": "*"
  }
}
```

In the `tsconfig.json` file, the following configurations are recommended to ensure that all of Eventual's features work properly:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["DOM"],
    "module": "esnext",
    "moduleResolution": "NodeNext"
  }
}
```

The `"DOM"` lib is required for Eventual's API (see: [Docs](../guide/api.md#router)).

`"esnext"` and `"NodeNext"` configure TypeScript to emit ESM-optimized code.

The `"ES2021"` target configures TypeScript to emit an efficient form of EcmaScript compatible with Node 16+.
