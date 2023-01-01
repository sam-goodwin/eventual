import * as ssm from "@aws-sdk/client-ssm";
import {
  NODE_REGION_CONFIG_OPTIONS,
  NODE_REGION_CONFIG_FILE_OPTIONS,
} from "@aws-sdk/config-resolver";
import { loadConfig } from "@aws-sdk/node-config-provider";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import { styledConsole } from "./styled-console.js";

/**
 * The data which is encoded in SSM for a given service under /eventual/services/{name}
 */
export interface ServiceData {
  apiEndpoint: string;
  functions: {
    orchestrator: string;
    activityWorker: string;
  };
}

/**
 * Fetch our service's connection data from ssm
 * @param service name of the service to fetch
 * @param region AWS region to use
 * @returns service data
 */
export async function getServiceData(
  credentials: AwsCredentialIdentity,
  name: string,
  region?: string
): Promise<ServiceData> {
  const ssmClient = new ssm.SSMClient({ region, credentials });
  const serviceParameter = await ssmClient.send(
    new ssm.GetParameterCommand({ Name: `/eventual/services/${name}` })
  );
  const serviceData = serviceParameter.Parameter?.Value;
  if (!serviceData) {
    styledConsole.error(
      `No ssm parameter /eventual/services/${name}. Have you deployed an Eventual Api?`
    );
    throw new Error("No ssm parameter");
  }
  return JSON.parse(serviceData);
}

export async function resolveRegion() {
  return await loadConfig(
    NODE_REGION_CONFIG_OPTIONS,
    NODE_REGION_CONFIG_FILE_OPTIONS
  )();
}
