# Get Started with the AWS Cloud Development Kit

To create a new AWS CDK project with Eventual, run the below command:

```sh
npm create eventual <project-name> --target aws-cdk
```

## Overview of the Project

A SST project structure contains two NPM packages:

1. the Stacks package
2. the Services package nested within the Stacks package

```sh
package.json
tsconfig.json
stacks/
  MyStack.ts # your service's Stack

# nested services packages
services/
  package.json
  functions/
    my-service.mts # the sample Eventual service code
```

## Drop in to existing Project

If you're already a user of SST and wish to begin using Eventual as a part of an existing project, you can import the `Service` Construct directly from `@eventual/aws-cdk` and incorporate it into your Stacks.

To drop Eventual into an existing AWS CDK project, import the `Service` Construct from `@eventual/aws-cdk`.

```ts
import { Service } from "@eventual/aws-cdk";
```

Then, instantiate the `Service` within a Stack and point it at the file containing your application code.

```ts
class MyStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new Service(this, "MyService", {
      entry: path.resolve(__dirname),
    });
  }
}
```
