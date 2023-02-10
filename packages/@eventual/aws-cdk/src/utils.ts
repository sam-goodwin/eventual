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

export const baseFnProps: Pick<
  FunctionProps,
  "runtime" | "architecture" | "environment"
> = {
  runtime: NODE_18_X,
  architecture: Architecture.ARM_64,
  environment: {
    NODE_OPTIONS: "--enable-source-maps",
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

export type PickType<T, U> = Pick<T, KeysOfType<T, U>>;

export type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];
