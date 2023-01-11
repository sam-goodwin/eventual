import {
  Architecture,
  Function,
  FunctionProps,
  Runtime,
  RuntimeFamily,
} from "aws-cdk-lib/aws-lambda";
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
