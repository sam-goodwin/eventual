import * as ssm from "@aws-sdk/client-ssm";
import { SSMClient } from "@aws-sdk/client-ssm";
import {
  NODE_REGION_CONFIG_OPTIONS,
  NODE_REGION_CONFIG_FILE_OPTIONS,
} from "@aws-sdk/config-resolver";
import { loadConfig } from "@aws-sdk/node-config-provider";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import { defaultService } from "./env.js";
import { styledConsole } from "./styled-console.js";
import fs from "fs/promises";
import path from "path";
import { readJsonFile } from "@eventual/project";
import { BuildManifest } from "@eventual/core-runtime";

/**
 * The data which is encoded in SSM for a given service under /eventual/services/{name}
 */
export interface ServiceData {
  apiEndpoint: string;
  eventBusArn: string;
  workflowExecutionLogGroupName: string;
  environmentVariables?: Record<string, string>;
}

/**
 * Fetch our service's connection data from ssm
 * @param service name of the service to fetch
 * @param region AWS region to use
 * @returns service data
 */
export async function getServiceData(
  credentials: AwsCredentialIdentity,
  serviceName: string,
  region?: string
): Promise<ServiceData> {
  const ssmClient = new SSMClient({ region, credentials });
  const serviceParameter = await ssmClient.send(
    new ssm.GetParameterCommand({ Name: `/eventual/services/${serviceName}` })
  );
  const serviceData = serviceParameter.Parameter?.Value;
  if (!serviceData) {
    styledConsole.error(
      `No ssm parameter /eventual/services/${serviceName}. Have you deployed an Eventual Api?`
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

/**
 * Attempts to resolve the service name to use for commands.
 * Logic:
 * 1. explicit value from --service
 * 2. environment variable from EVENTUAL_DEFAULT_SERVICE
 * 3. List all service names, if there is one service name in the account, use it
 * 4. Fail
 */
export async function tryResolveDefaultService(
  outDir: string,
  _serviceName?: string
) {
  // explicit
  if (_serviceName) {
    return _serviceName;
  }
  const envServiceName = defaultService();
  if (envServiceName) {
    // ENV
    return envServiceName;
  }
  // check if there are zero, one, or more than one service names.
  const serviceNames = await getLocalServices(outDir);
  const [serviceName, otherServiceName] = serviceNames;
  if (!serviceName) {
    return undefined;
  } else if (otherServiceName) {
    throw new Error(
      "Multiple service names found, provide a default service name via EVENTUAL_DEFAULT_SERVICE or the --service flag"
    );
  }
  return serviceName;
}

export async function getLocalServices(outDir: string): Promise<string[]> {
  try {
    const paths = await fs.readdir(path.resolve(outDir, ".eventual"));

    const manifestResults = await Promise.allSettled(
      paths.map(async (serviceName) => {
        return fs
          .access(
            path.resolve(
              path.resolve(outDir, ".eventual", serviceName, "manifest.json")
            )
          )
          .then(() => serviceName);
      })
    );

    return manifestResults
      .filter(
        (s): s is Exclude<typeof s, PromiseRejectedResult> =>
          s.status === "fulfilled"
      )
      .map((s) => s.value);
  } catch {
    return [];
  }
}

export async function tryResolveDefaultServiceRemote(
  _serviceName?: string,
  region?: string
) {
  // explicit
  if (_serviceName) {
    return _serviceName;
  }
  const envServiceName = defaultService();
  if (envServiceName) {
    // ENV
    return envServiceName;
  }
  // check if there are zero, one, or more than one service names.
  const serviceNames = await getRemoteServices(region, 2);
  const [serviceName, otherServiceName] = serviceNames;
  if (!serviceName) {
    throw new Error(
      "No service name found. Have you deployed an Eventual Api?"
    );
  } else if (otherServiceName) {
    throw new Error(
      "Multiple service names found, provide a default service name via EVENTUAL_DEFAULT_SERVICE or the --service flag"
    );
  }
  return serviceName;
}

export async function getRemoteServices(region?: string, max?: number) {
  const ssmClient = new ssm.SSMClient({ region });
  const serviceParameters = await ssmClient.send(
    new ssm.DescribeParametersCommand({
      ParameterFilters: [
        {
          Key: "Path",
          Values: ["/eventual/services/"],
        },
      ],
      MaxResults: max,
    })
  );

  return (
    serviceParameters.Parameters?.map(
      (p) => p.Name?.split("/eventual/services/")[1]
    ) ?? []
  );
}

export async function isServiceDeployed(serviceName: string, region?: string) {
  const ssmClient = new ssm.SSMClient({ region });
  const serviceParameters = await ssmClient.send(
    new ssm.DescribeParametersCommand({
      ParameterFilters: [
        {
          Key: "Name",
          Values: [`/eventual/services/${serviceName}`],
        },
      ],
      MaxResults: 1,
    })
  );

  return (
    serviceParameters.Parameters && serviceParameters.Parameters?.length > 0
  );
}

export async function getBuildManifest(outDir: string, serviceName: string) {
  return (await readJsonFile(
    path.resolve(outDir, ".eventual", serviceName, "manifest.json")
  )) as BuildManifest;
}
