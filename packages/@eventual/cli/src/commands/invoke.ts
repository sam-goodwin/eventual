import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJson } from "./utils.js";

export const sendSignal = (yargs: Argv) =>
  yargs.command(
    "invoke <command>",
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
        .option("input", {
          describe:
            "Payload data as json string to be sent with the signal. Cannot be used with payloadFile. If neither are given, uses stdin.",
          type: "string",
          alias: "p",
        }),
    serviceAction(async (spinner, service, { command, input, inputFile }) => {
      const inputJSON = await getInputJson(
        inputFile,
        input,
        "inputFile",
        "input"
      );

      spinner.start(`Invoking ${command}`);
      try {
        const output = await service.invokeCommand({
          command,
          payload: inputJSON,
        });
        process.stdout.write(JSON.stringify(output, null, 2));
        process.stdout.write("\n");
      } finally {
        spinner.stop();
      }
    })
  );
