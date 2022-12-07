import { Architecture, Runtime, RuntimeFamily } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunctionProps,
  OutputFormat,
} from "aws-cdk-lib/aws-lambda-nodejs";

export const NODE_18_X = new Runtime("nodejs18.x", RuntimeFamily.NODEJS, {
  supportsInlineCode: true,
});

export const baseNodeFnProps = {
  runtime: Runtime.NODEJS_16_X,
  architecture: Architecture.ARM_64,
  bundling: {
    // https://github.com/aws/aws-cdk/issues/21329#issuecomment-1212336356
    // cannot output as .mjs file as ulid does not support it.
    mainFields: ["module", "main"],
    esbuildArgs: {
      "--conditions": "module,import,require",
    },
    metafile: true,
    // target node 16+
    target: "es2021",
    format: OutputFormat.ESM,
  },
} satisfies NodejsFunctionProps;
