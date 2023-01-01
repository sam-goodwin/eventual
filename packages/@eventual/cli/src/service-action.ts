import ora, { Ora } from "ora";
import { Arguments, Argv } from "yargs";
import { styledConsole } from "./styled-console.js";
import util from "util";
import { AwsHttpServiceClient } from "@eventual/aws-client";
import { EventualServiceClient } from "@eventual/core";
import { assumeCliRole } from "./role.js";
import { getServiceData } from "./service-data.js";
import { resolveRegionConfig } from "@aws-sdk/config-resolver";

export type ServiceAction<T> = (
  spinner: Ora,
  serviceClient: EventualServiceClient,
  args: Arguments<T>
) => Promise<void>;

export type ServiceJsonAction<T> = (
  serviceClient: EventualServiceClient,
  args: Arguments<T>
) => Promise<void>;

/**
 * Designed to be used in command.action. Injects a usable api ky instance and wraps errors nicely
 * @param action Callback to perform for the action
 */
export const serviceAction =
  <T>(action: ServiceAction<T>, jsonAction?: ServiceJsonAction<T>) =>
  async (
    args: Arguments<
      { debug: boolean; service: string; region?: string; json?: boolean } & T
    >
  ) => {
    const spinner = args.json ? undefined : ora().start("Preparing");
    try {
      const region = resolveRegionConfig({ region: args.region }).region;
      const credentials = await assumeCliRole(args.service, region);
      const serviceData = await getServiceData(
        credentials,
        args.service,
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
        return jsonAction(serviceClient, args);
      }
      return await action(spinner, serviceClient, args);
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
  service: string;
  region: string | undefined;
  json?: boolean;
}> => {
  const opts = yargs
    .positional("service", {
      type: "string",
      description: "Name of service to operate on",
      demandOption: true,
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
