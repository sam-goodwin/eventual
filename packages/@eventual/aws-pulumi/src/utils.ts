import { Input, Output, Resource } from "@pulumi/pulumi";
import path from "path";
import type { Function, FunctionProps } from "./aws/function";

export const baseFnProps: Pick<FunctionProps, "runtime" | "architectures"> = {
  runtime: "nodejs16.x",
  architectures: ["arm64"],
};

export function addEnvironment(
  func: Function,
  variables: Record<string, Input<string>>
) {
  Object.entries(variables).forEach(([key, value]) =>
    func.addEnvironment(key, value)
  );
}

export function runtimeHandlersEntrypoint(name: string) {
  return path.join(runtimeEntrypoint(), `/handlers/${name}.js`);
}

export function runtimeEntrypoint() {
  return path.join(require.resolve("@eventual/aws-runtime"), `../../esm`);
}

export function outDir(scope: Resource, ...paths: string[]): Output<string> {
  return scope.urn.apply((urn) => path.join(".eventual", urn, ...paths));
}
