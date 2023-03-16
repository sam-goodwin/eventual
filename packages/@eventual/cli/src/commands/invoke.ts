import { HttpServiceClient } from "@eventual/client";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJson } from "./utils.js";

export const invokeCommand = (yargs: Argv) =>
  yargs.command(
    "invoke <command> [input]",
    "Send a signal to a running execution",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("command", {
          describe: "Command Name",
          type: "string",
          demandOption: true,
        })
        .option("inputFile", {
          alias: "f",
          describe:
            "Payload file containing json compatible data to be sent with the signal. Cannot be used with payload. If neither are given, uses stdin.",
          type: "string",
        })
        .positional("input", {
          describe:
            "Payload data as json string to be sent with the signal. Cannot be used with payloadFile. If neither are given, uses stdin.",
          type: "string",
        })
        .option("header", {
          describe: "One or more headers formatted as [name]:[value].",
          type: "array",
          string: true,
        }),
    (args) => {
      return serviceAction(
        async (spinner, _, __, { serviceData }) => {
          spinner.start(`Invoking ${args.command}`);
          try {
            const output = await invokeCommand(serviceData.apiEndpoint);
            process.stdout.write(JSON.stringify(output, null, 2));
            process.stdout.write("\n");
          } finally {
            spinner.stop();
          }
        },
        async (_, __, { serviceData }) => {
          const output = await invokeCommand(serviceData.apiEndpoint);

          process.stdout.write(JSON.stringify(output));
          process.stdout.write("\n");
        }
      )(args);

      async function invokeCommand(apiEndpoint: string) {
        const inputJSON = await getInputJson(
          args.inputFile,
          args.input,
          "inputFile",
          "input"
        );

        if (args.header && args.header.some((h) => h.includes(":"))) {
          throw new Error(
            "--header options must be formatted as [name]:[value]"
          );
        }
        const headers = args.header
          ? Object.fromEntries(
              args.header.map(
                (h) => h.split(":").slice(0, 2) as [string, string]
              )
            )
          : undefined;
        const httpClient = new HttpServiceClient({
          serviceUrl: apiEndpoint,
        });
        return await httpClient.rpc({
          command: args.command,
          payload: inputJSON,
          headers,
        });
      }
    }
  );
