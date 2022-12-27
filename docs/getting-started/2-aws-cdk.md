# Get Started with the AWS Cloud Development Kit

To create a new AWS CDK project with Eventual, run the below command:

```sh
npm create eventual <project-name> --target aws-cdk
```

## Overview of the Template

An AWS CDK project structure contains two NPM packages:

1. the Stacks package (for your infrastructure configuration)
2. the Services package (for your application code)

### Stacks package

The Stacks package is where you configure your infrastructure.

```sh
package.json
tsconfig.json
cdk.json
src/
  app.ts # the CDK application entrypoint
  my-stack.ts # your service's Stack
```

The template creates an initial file, `stack.ts`, which provides a class, `MyStack` that extends `Stack` and instantiates a single Eventual `Service`.

```ts
import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { Service } from "@eventual/aws-cdk";

export interface MyStackProps extends StackProps {}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props?: MyStackProps) {
    super(scope, id, props);

    const service = new Service(this, "Service", {
      name: "my-service",
      entry: path.join(__dirname, "services", "src", "my-service.ts"),
    });
  }
}
```

`MyStack` is then instantiated within `app.ts` which is your application's entrypoint:

```ts
import { App, Stack } from "aws-cdk-lib";
import path from "path";
import { MyStack } from "./my-stack";

const app = new App();

new MyStack(app, "my-stack");
```

When you run `cdk deploy`, the CDK will run your program starting with `app.ts` as configured in `cdk.json`:

```json
{
  "app": "ts-node ./src/app.ts"
}
```

### Services package

The Services package is nested within the Stacks package in the folder, `services`. It contains the application logic for your Service.

```sh
# nested services packages
services/
  package.json
  src/
    index.ts # the Eventual service entrypoint
```

The template creates an initial file, `src/index.ts`, that contains a basic example application touching on each of the 4 Eventual primitives, `api`, `event`, `workflow` and `activity`. For a walk-through of how to build applications with Eventual, see the [Tutorial](../tutorial/0-hello-world.md).

## Drop in to existing Project

If you're already a user of the AWS CDK and wish to begin using Eventual as a part of an existing project, you can import the `Service` Construct directly from `@eventual/aws-cdk` and incorporate it into your Stacks.

```ts
import { Service } from "@eventual/aws-cdk";
```

Then, instantiate the `Service` within a Stack and point it at the file containing your application code.

```ts
class MyStack extends Stack {
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
