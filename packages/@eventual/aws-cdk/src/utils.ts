import {
  Architecture,
  Function,
  FunctionProps,
  Runtime,
  RuntimeFamily,
} from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunctionProps,
  OutputFormat,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { IConstruct } from "constructs";
import path from "path";
import { Service } from "./service";

export const NODE_18_X = new Runtime("nodejs18.x", RuntimeFamily.NODEJS, {
  supportsInlineCode: true,
});

export const baseFnProps: Pick<FunctionProps, "runtime" | "architecture"> = {
  runtime: Runtime.NODEJS_16_X,
  architecture: Architecture.ARM_64,
};

export const baseNodeFnProps: NodejsFunctionProps = {
  ...baseFnProps,
  bundling: {
    // https://github.com/aws/aws-cdk/issues/21329#issuecomment-1212336356
    // cannot output as .mjs file as ulid does not support it.
    mainFields: ["module", "main"],
    esbuildArgs: {
      "--conditions": "module,import,require",
    },
    banner: `import { createRequire as topLevelCreateRequire } from 'module'; const require = topLevelCreateRequire(import.meta.url);`,
    metafile: true,
    // target node 16+
    target: "es2021",
    format: OutputFormat.ESM,
  },
};

export function addEnvironment(
  func: Function,
  variables: Record<string, string>
) {
  Object.entries(variables).forEach(([key, value]) =>
    func.addEnvironment(key, value)
  );
}

export function outDir(scope: IConstruct, ...paths: string[]): string {
  while (!(scope instanceof Service)) {
    if (!scope.node.scope) {
      throw new Error(`cannot find Service`);
    }
    scope = scope.node.scope!;
  }
  return path.join(".eventual", scope.node.addr, ...paths);
}
