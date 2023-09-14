import {
  serviceFunctionName,
  socketServiceSocketName,
} from "@eventual/aws-runtime";
import { ArnFormat, Stack } from "aws-cdk-lib/core";
import {
  Architecture,
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

export type ServiceEntityProps<Service, Kind extends string, Value> = {
  // first, pluck the methods where the exported name and the string name are the same
  // these we want to use direct pick so that the type-level connection is maintained
  // this gives us jump to definition from client.method to export const method = command()
  // it also carries forward documentation on the method declaration
  [k in keyof Pick<Service, KeysWhereNameIsSame<Service, Kind>>]: Value;
} & {
  // second, if the method's string name differs from the exported name, then transform
  // from the exported name into the command literal name
  // this is a fall back as it loses the aforementioned links
  // we still get type-safety but no jump to definition or carry-forward of docs from
  // the command declaration
  // those features will still work for the input passed into the command, but not the
  // command itself.
  [k in keyof Pick<
    Service,
    KeysWhereNameIsDifferent<Service, Kind>
  > as Service[k] extends { name: infer Name extends string }
    ? Name
    : never]: Value;
};

export type GetServiceEntityNames<Service, Kind> =
  | KeysWhereNameIsSame<Service, Kind>
  | KeysWhereNameIsDifferent<Service, Kind>;

export type KeysWhereNameIsSame<Service, Kind> = {
  [k in keyof Service]: k extends Extract<Service[k], { name: string }>["name"]
    ? // we only want commands to show up
      Service[k] extends { kind: Kind }
      ? k
      : never
    : never;
}[keyof Service];

export type KeysWhereNameIsDifferent<Service, Kind> = Exclude<
  KeysOfType<Service, { kind: Kind }>,
  KeysWhereNameIsSame<Service, Kind>
>;

export type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];

export function serviceFunctionArn(
  serviceName: string,
  stack: Stack,
  nameSuffix: string,
  sanitized = true
) {
  return stack.formatArn({
    service: "lambda",
    resourceName: sanitized
      ? serviceFunctionName(serviceName, nameSuffix)
      : `${serviceName}-${nameSuffix}`,
    resource: "function",
    arnFormat: ArnFormat.COLON_RESOURCE_NAME,
  });
}

export function serviceTableArn(
  serviceName: string,
  stack: Stack,
  nameSuffix: string,
  sanitized = true
) {
  return stack.formatArn({
    service: "dynamodb",
    resourceName: sanitized
      ? serviceFunctionName(serviceName, nameSuffix)
      : `${serviceName}-${nameSuffix}`,
    resource: "table",
    arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
  });
}

export function serviceBucketArn(
  serviceName: string,
  nameSuffix: string,
  sanitized = true
) {
  return formatBucketArn(
    sanitized
      ? serviceFunctionName(serviceName, nameSuffix)
      : `${serviceName}-${nameSuffix}`
  );
}

export function formatBucketArn(bucketName: string) {
  return `arn:aws:s3:::${bucketName}`;
}

export function serviceQueueArn(
  serviceName: string,
  nameSuffix: string,
  sanitized = true
) {
  return formatQueueArn(
    sanitized
      ? serviceFunctionName(serviceName, nameSuffix)
      : `${serviceName}-${nameSuffix}`
  );
}

export function serviceApiArn(
  serviceName: string,
  stack: Stack,
  nameSuffix: string,
  sanitized = true
) {
  return stack.formatArn({
    service: "execute-api",
    resource: sanitized
      ? socketServiceSocketName(serviceName, nameSuffix)
      : `${serviceName}-${nameSuffix}`,
    resourceName: "*/*/*/*",
    arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
  });
}

export function formatQueueArn(queueName: string, region = "*", account = "*") {
  return `arn:aws:sqs:${region}:${account}:${queueName}`;
}
