import { HTTPError } from "ky";
import type { KyInstance } from "ky/distribution/types/ky";
import { apiKy } from "./api-ky.js";
import { Command } from "commander";
import { styledConsole } from "./styled-console.js";

export type ApiAction = (ky: KyInstance, ...args: any[]) => Promise<void>;

/**
 * Designed to be used in command.action. Injects a usable api ky instance and wraps errors nicely
 * @param action Callback to perform for the action
 */
export const apiAction =
  (action: ApiAction) =>
  async (...args: any[]) => {
    //last argument is the command itself, second last is options
    const options = args.at(-2);
    const ky = await apiKy(options.region);
    return styledCatchApiRequestError(action(ky, ...args));
  };

/**
 * Catch api errors and print the messages nicely
 * @param req promise to catch
 */
export function styledCatchApiRequestError<T>(
  req: Promise<T>
): Promise<void | T> {
  return req.catch(async (e) => {
    if (e instanceof HTTPError) {
      styledConsole.error(await e.response.json());
    } else {
      console.log(e);
    }
  });
}

export const regionOption = ["-r, --region <region>", "API region"] as const;

/**
 * Add an api action to a command. Ensures it has region option
 * @param command the command to wrap
 * @param action Action to perform
 * @returns Updated command
 */
export function withApiAction(command: Command, action: ApiAction): Command {
  return command.option(...regionOption).action(apiAction(action));
}
