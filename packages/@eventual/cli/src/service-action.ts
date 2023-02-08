import { AwsCredentialIdentity } from "@aws-sdk/types";
import { AWSHttpEventualClient } from "@eventual/aws-client";
import { HttpEventualClient } from "@eventual/client";
import ora, { Ora } from "ora";
import util from "util";
import { Arguments, Argv } from "yargs";
import { assumeCliRole } from "./role.js";
import {
  getServiceData,
  resolveRegion,
  ServiceData,
  tryResolveDefaultService,
} from "./service-data.js";
import { styledConsole } from "./styled-console.js";

export type ServiceAction<T> = (
  spinner: Ora,
  serviceClient: HttpEventualClient,
  args: Arguments<T & { service: string }>,
  resolved: {
    credentials: AwsCredentialIdentity;
    serviceName: string;
    serviceData: ServiceData;
  }
) => Promise<void>;

export type ServiceJsonAction<T> = (
  serviceClient: HttpEventualClient,
  args: Arguments<T & { service: string }>,
  resolved: {
    credentials: AwsCredentialIdentity;
    serviceName: string;
    serviceData: ServiceData;
  }
) => Promise<void>;

/**
 * Designed to be used in command.action. Injects a usable api ky instance and wraps errors nicely
 * @param action Callback to perform for the action
 */
export function serviceAction<T>(
  action: ServiceAction<T>,
  jsonAction?: ServiceJsonAction<T>
) {
  return async (
    args: Arguments<
      { debug: boolean; service?: string; region?: string; json?: boolean } & T
    >
  ) => {
    const spinner = args.json ? undefined : ora().start("Preparing");
    try {
      const region = args.region ?? (await resolveRegion());
      const serviceName = await tryResolveDefaultService(args.service, region);
      const credentials = await assumeCliRole(serviceName, region);
      const serviceData = await getServiceData(
        credentials,
        serviceName,
        region
      );
      const serviceClient = new AWSHttpEventualClient({
        credentials,
        serviceUrl: serviceData.apiEndpoint,
        region,
      });
      if (!spinner) {
        if (!jsonAction) {
          throw new Error("Operation does not support --json.");
        }
        return jsonAction(
          serviceClient,
          { ...args, service: serviceName },
          { serviceData, serviceName, credentials }
        );
      }
      return await action(
        spinner,
        serviceClient,
        {
          ...args,
          service: serviceName,
        },
        { serviceData, serviceName, credentials }
      );
    } catch (e: any) {
      if (args.debug) {
        styledConsole.error(util.inspect(e));
      }
      try {
        // if the service returns an error object, parse and display it.
        const errorObj = JSON.parse(e.message);
        if ("error" in errorObj) {
          spinner?.fail(`${errorObj.error}: ${errorObj.message}`);
          process.exit(1);
        }
      } catch {
        spinner?.fail(e.message);
      }
      process.exit(1);
    }
  };
}

/**
 * Adding options for service commands
 * @param name command name
 * @returns the command
 */
export const setServiceOptions = (
  yargs: Argv,
  jsonMode = false
): Argv<{
  debug: boolean;
  service?: string;
  region: string | undefined;
  json?: boolean;
}> => {
  const opts = yargs
    .option("service", {
      type: "string",
      description: "Name of service to operate on",
    })
    .option("region", { alias: "r", type: "string" })
    .option("debug", {
      alias: "d",
      describe: "Enable debug output",
      default: false,
      boolean: true,
    });

  if (jsonMode) {
    return opts.option("json", {
      describe: "Return json instead of formatted output",
      boolean: true,
    });
  }

  return opts;
};
