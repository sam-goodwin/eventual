import path from "path";
import fs from "fs";

const outputsFile = process.env.OUTPUTS_FILE ?? "cdk.out/outputs.json";

const outputs = fs.existsSync(path.resolve(outputsFile))
  ? JSON.parse(fs.readFileSync(path.resolve(outputsFile)).toString("utf-8"))
  : undefined;

export const queueUrl = () => outputs?.["eventual-tests"]?.workflowQueueUrl;
export const tableName = () => outputs?.["eventual-tests"]?.serviceTableName;
export const testArn = () => outputs?.["eventual-tests"]?.roleArn;
