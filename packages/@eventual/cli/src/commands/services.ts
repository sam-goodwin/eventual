import { Argv } from "yargs";
import ora from "ora";
import { styledConsole } from "../styled-console.js";
import { getRemoteServices } from "../service-data.js";

export const services = (yargs: Argv) =>
  yargs.command(
    "services",
    "List Eventual services",
    (yargs) =>
      yargs
        .option("region", {
          alias: "r",
          describe: "Region to query",
          type: "string",
        })
        .option("json", {
          describe: "Return json instead of formatted output",
          boolean: true,
          default: false,
        }),
    async ({ region, json }) => {
      if (json) {
        process.stdout.write(JSON.stringify(await getRemoteServices(region)));
        process.stdout.write("\n");
      } else {
        const spinner = ora("Getting services").start();
        const services = await getRemoteServices(region);
        spinner.stop();
        styledConsole.success("Services");
        process.stdout.write(services.join("\n"));
        process.stdout.write("\n");
      }
    }
  );
