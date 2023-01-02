import ora, { Ora } from "ora";
import { Arguments, Argv } from "yargs";
import { styledConsole } from "./styled-console.js";
import util from "util";
import { AwsHttpServiceClient } from "@eventual/aws-client";
import { EventualServiceClient } from "@eventual/core";
import { assumeCliRole } from "./role.js";
import {
  getServiceData,
  resolveRegion,
  tryResolveDefaultService,
} from "./service-data.js";

export type ServiceAction<T> = (
  spinner: Ora,
  serviceClient: EventualServiceClient,
  args: Arguments<T & { service: string }>
) => Promise<void>;

export type ServiceJsonAction<T> = (
  serviceClient: EventualServiceClient,
  args: Arguments<T & { service: string }>
) => Promise<void>;

/**
 * Designed to be used in command.action. Injects a usable api ky instance and wraps errors nicely
 * @param action Callback to perform for the action
 */
export const serviceAction =
  <T>(action: ServiceAction<T>, jsonAction?: ServiceJsonAction<T>) =>
  async (
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
      const serviceClient = new AwsHttpServiceClient({
        credentials,
        serviceUrl: serviceData.apiEndpoint,
        region,
      });
      if (!spinner) {
        if (!jsonAction) {
          throw new Error("Operation does not support --json.");
        }
        return jsonAction(serviceClient, { ...args, service: serviceName });
      }
      return await action(spinner, serviceClient, {
        ...args,
        service: serviceName,
      });
    } catch (e: any) {
      if (args.debug) {
        styledConsole.error(util.inspect(e));
      }
      spinner?.fail(e.message);
      process.exit(1);
    }
  };

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
      default: false,
    });
  }

  return opts;
};
