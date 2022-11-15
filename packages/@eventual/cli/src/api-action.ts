import { Command } from "commander";
import { HTTPError } from "ky";
import ora, { Ora } from "ora";
import { apiKy } from "./api-ky.js";
import { styledConsole } from "./styled-console.js";
import type { KyInstance } from "./types.js";

export type ApiAction = (
  spinner: Ora,
  ky: KyInstance,
  ...args: any[]
) => Promise<void>;

/**
 * Designed to be used in command.action. Injects a usable api ky instance and wraps errors nicely
 * @param action Callback to perform for the action
 */
export const apiAction =
  (action: ApiAction, _onError?: (error: any) => Promise<void> | void) =>
  async (...args: any[]) => {
    //last argument is the command itself, second last is options
    const options = args.at(-2);
    const spinner = ora().start("Preparing");
    try {
      const ky = await apiKy(options.region);
      return await action(spinner, ky, ...args);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  };

/**
 * Catch api errors and print the messages nicely
 * @param req promise to catch
 */
export async function styledCatchApiRequestError<T>(
  req: Promise<T>,
  onError: (e: any) => Promise<T> | T
): Promise<T> {
  return req.catch(async (e) => {
    if (e instanceof HTTPError) {
      styledConsole.error(await e.response.json());
    } else {
      console.log(e);
    }
    return await onError(e);
  });
}

/**
 * Wrapper for Command constructor, adding region necessary for api calls
 * @param name command name
 * @returns the command
 */
export function apiCommand(name: string): Command {
  return new Command(name).option("-r, --region <region>", "API region");
}
