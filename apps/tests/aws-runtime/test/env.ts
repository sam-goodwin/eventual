import path from "path";
import fs from "fs";

const outputsFile = process.env.OUTPUTS_FILE ?? "cdk.out/outputs.json";

const outputs = fs.existsSync(path.resolve(outputsFile))
  ? JSON.parse(fs.readFileSync(path.resolve(outputsFile)).toString("utf-8"))
  : undefined;

export const serviceUrl = () => outputs?.["eventual-tests"]?.serviceUrl;
export const chaosSSMParamName = () =>
  outputs?.["eventual-tests"]?.chaosParamName;
