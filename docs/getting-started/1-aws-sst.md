# Getting started with AWS SST

To create a new [SST](https://sst.dev) project with Eventual, run the below command:

```sh
npm create eventual my-eventual-sst-app --target aws-sst
```

## Overview of the Template

The SST project structure contains two NPM packages:

1. the Stacks package (for your infrastructure configuration)
2. the Services package (for your business logic)

### Stacks package

The Stacks package is where you configure your infrastructure.

```sh
package.json
tsconfig.json
stacks/
  MyStack.ts # your service's Stack
```

The template creates an initial file, `MyStack.ts`, which instantiates a single Eventual `Service`.

```ts
import { StackContext } from "@serverless-stack/resources";
import { Service } from "@eventual/aws-cdk";
import path from "path";

export function MyStack({ stack }: StackContext) {
  // instantiate a single Eventual Service and point at the Service package entrypoint
  const service = new Service(stack, "Service", {
    name: "my-service",
    entry: path.resolve("services", "functions", "index.ts"),
  });

  // expose the Service's API gateway url as an Output from the Sack
  stack.addOutputs({
    ApiEndpoint: service.api.gateway.url!,
  });
}
```

The `entry` property points at the `index.ts` in the [Services package](#services-package)

```ts
entry: path.resolve("services", "functions", "index.ts"),
```

### Services package

The Services package is nested within the Stacks package under the `services` folder. It contains the application logic for your Service.

```sh
# nested services packages
services/
  package.json
  functions/
    index.ts # the Eventual service entrypoint
```

The template creates an initial file, `functions/index.ts`, containing a basic example application that touches on each of the 4 Eventual primitives, `api`, `event`, `workflow` and `activity`. For a walk-through of how to build applications with Eventual, see the [Tutorial](../tutorial/0-hello-world.md).

## Drop in to existing Project

If you're already a user of SST and wish to begin using Eventual as a part of an existing project, you can import the `Service` Construct directly from `@eventual/aws-cdk` and incorporate it into your Stacks.

```ts
import { Service } from "@eventual/aws-cdk";
```

Then, instantiate the `Service` within a Stack and point it at the file containing your application code.

```ts
import { StackContext } from "@serverless-stack/resources";
import { Service } from "@eventual/aws-cdk";
import path from "path";

export function MyStack({ stack }: StackContext) {
  const service = new Service(stack, "Service", {
    name: "my-service",
    // resolve the path of the .ts (or .js) file containing your service code
    entry: path.resolve("services", "functions", "my-service.ts"),
  });
}
```
