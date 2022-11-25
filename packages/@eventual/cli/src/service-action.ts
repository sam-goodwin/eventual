import { HTTPError } from "ky";
import ora, { Ora } from "ora";
import { Arguments, Argv } from "yargs";
import { apiKy } from "./api-ky.js";
import { styledConsole } from "./styled-console.js";
import type { KyInstance } from "./types.js";
import util from "util";

export type ServiceAction<T> = (
  spinner: Ora,
  ky: KyInstance,
  args: Arguments<T>
) => Promise<void>;

/**
 * Designed to be used in command.action. Injects a usable api ky instance and wraps errors nicely
 * @param action Callback to perform for the action
 */
export const serviceAction =
  <T>(
    action: ServiceAction<T>,
    _onError?: (error: any) => Promise<void> | void
  ) =>
  async (
    args: Arguments<{ debug: boolean; service: string; region?: string } & T>
  ) => {
    const spinner = ora().start("Preparing");
    try {
      const ky = await apiKy(args.service, args.region);
      return await action(spinner, ky, args);
    } catch (e: any) {
      if (args.debug) {
        if (e instanceof HTTPError) {
          spinner.clear();
          styledConsole.error(`Request: ${util.inspect(e.request)}`);
          styledConsole.error(`Response: ${await e.response.text()}`);
        } else {
          styledConsole.error(util.inspect(e));
        }
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
