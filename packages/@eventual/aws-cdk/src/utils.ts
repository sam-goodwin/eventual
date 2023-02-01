import {
  Architecture,
  Function,
  FunctionProps,
  Runtime,
  RuntimeFamily,
} from "aws-cdk-lib/aws-lambda";

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
