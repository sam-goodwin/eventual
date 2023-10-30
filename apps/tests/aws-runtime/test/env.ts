import path from "path";
import fs from "fs";

const outputsFile = process.env.OUTPUTS_FILE ?? "cdk.out/outputs.json";
const testLocal = process.env.TEST_LOCAL;
const serviceUrlOverride = process.env.TEST_SERVICE_URL;

const outputs =
  !testLocal && fs.existsSync(path.resolve(outputsFile))
    ? JSON.parse(fs.readFileSync(path.resolve(outputsFile)).toString("utf-8"))
    : undefined;

export const awsRegion = () => process.env.AWS_REGION ?? "us-east-1";
export const serviceUrl = () =>
  serviceUrlOverride ??
  outputs?.["eventual-tests"]?.serviceUrl ??
  "http://localhost:3111";
export const testSocketUrl = () =>
  outputs?.["eventual-tests"]?.testSocketUrl ??
  "http://localhost:3111/__ws/socket1";
export const chaosSSMParamName = () =>
  outputs?.["eventual-tests"]?.chaosParamName;
