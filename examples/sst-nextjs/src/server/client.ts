import type * as server from ".";
import { AWSServiceClient } from "@eventual/aws-client";

export const client = new AWSServiceClient<typeof server>({
  serviceUrl: process.env.SERVICE_URL!,
});
