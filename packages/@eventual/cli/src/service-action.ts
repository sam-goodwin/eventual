import ora, { Ora } from "ora";
import { Arguments, Argv } from "yargs";
import { styledConsole } from "./styled-console.js";
import util from "util";
import { AwsHttpServiceClient } from "./aws-service-client.js";
import { EventualServiceClient } from "@eventual/core";
import { assumeCliRole } from "./role.js";
import { getServiceData, resolveRegion } from "./service-data.js";

export type ServiceAction<T> = (
  spinner: Ora,
  serviceClient: EventualServiceClient,
  args: Arguments<T>
) => Promise<void>;

/**
 * Designed to be used in command.action. Injects a usable api ky instance and wraps errors nicely
 * @param action Callback to perform for the action
 */
export const serviceAction =
  <T>(action: ServiceAction<T>) =>
  async (
    args: Arguments<{ debug: boolean; service: string; region?: string } & T>
  ) => {
    const spinner = ora().start("Preparing");
    try {
      // TODO: completely refactor out ky client.
      const region = args.region ?? (await resolveRegion());
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
      return await action(spinner, serviceClient, args);
    } catch (e: any) {
      if (args.debug) {
        styledConsole.error(util.inspect(e));
      }
      spinner.fail(e.message);
      process.exit(1);
    }
  };

/**
 * Adding options for service commands
 * @param name command name
 * @returns the command
 */
export const setServiceOptions = (yargs: Argv) =>
  yargs
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
