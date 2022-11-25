import * as ssm from "@aws-sdk/client-ssm";
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
  name: string,
  region?: string
): Promise<ServiceData> {
  const ssmClient = new ssm.SSMClient({ region });
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
