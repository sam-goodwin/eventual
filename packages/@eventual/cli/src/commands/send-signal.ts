import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJson } from "./utils.js";

export const sendSignal = (yargs: Argv) =>
  yargs.command(
    "signal <signal> [input]",
    "Send a signal to a running execution",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("signal", {
          describe: "Signal Id",
          type: "string",
          demandOption: true,
        })
        .option("execution", {
          alias: "e",
          describe: "Execution id",
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
        }),
    serviceAction(
      async (spinner, service, { execution, signal, input, inputFile }) => {
        const inputJSON = await getInputJson(
          inputFile,
          input,
          "payloadFile",
          "payload"
        );

        spinner.start("Sending Signal");
        await service.sendSignal({
          execution,
          signal,
          payload: inputJSON,
        });
        spinner.stop();
      }
    )
  );
