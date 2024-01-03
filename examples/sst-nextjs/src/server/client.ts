import type * as server from ".";
import { AWSServiceClient } from "@eventual/aws-client";

console.log(process.env.SERVICE_URL);

export const client = new AWSServiceClient<typeof server>({
  serviceUrl: process.env.SERVICE_URL ?? "http://localhost:3111",
});
