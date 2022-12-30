import { StackContext } from "@serverless-stack/resources";
import { Service } from "@eventual/aws-cdk";
import path from "path";

export function MyStack({ stack }: StackContext) {
  const service = new Service(stack, "Service", {
    entry: path.resolve("services", "functions", "service.ts"),
    name: "my-service",
  });
  stack.addOutputs({
    ApiEndpoint: service.api.gateway.url!,
  });
}
