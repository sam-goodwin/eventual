---
title: SST for AWS
---

# SST for AWS Project Overview

To create a new [SST](https://sst.dev) project with Eventual, run the below command:

```sh
npm create eventual my-eventual-sst-app --target aws-sst
```

## Overview of the Template

This will create a new project with two npm packages: a "Stacks" package for your infrastructure configuration, and a "Services" package for your business logic.

### Stacks package

The Stacks package contains a file called "MyStack.ts" which instantiates an Eventual Service and points to the entry point of the Services package.

```sh
package.json
tsconfig.json
stacks/
  MyStack.ts # your service's Stack
```

The file "MyStack.ts" creates a new Service with the following code:

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

Note that the `entry` property points to a file, `index.ts`, located within the ["Services" package](#services-package) in the `services/functions` folder provided by SST. This is typically where Lambda Functions and other business logic code is stored in an SST project.

### Services package

The Services package, located in the "services" folder, contains an "index.ts" file with a basic example application demonstrating the use of the Eventual primitives "api," "event," "workflow," and "activity."

```sh
# nested services packages
services/
  package.json
  functions/
    index.ts # the Eventual service entrypoint
```

## Drop in to existing Project

If you're already a user of SST and wish to begin using Eventual as a part of an existing project, you can import the `Service` Construct directly from `@eventual/aws-cdk` and incorporate it into your Stacks.

```ts
import { Service } from "@eventual/aws-cdk";
```

Then, within your Stack, instantiate a `Service` and specify the file containing your business logic as the `entry` property. For example:

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

Once you have added the Service Construct and specified your application code, you can deploy your updated stack using the `sst deploy` command.
