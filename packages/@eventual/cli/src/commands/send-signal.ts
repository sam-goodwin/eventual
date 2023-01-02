import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJson } from "./utils.js";

export const sendSignal = (yargs: Argv) =>
  yargs.command(
    "send-signal <execution> <signal> [payloadFile]",
    "Send a signal to a running execution",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("execution", {
          describe: "Execution Id",
          type: "string",
          demandOption: true,
        })
        .positional("signal", {
          describe: "Signal Id",
          type: "string",
          demandOption: true,
        })
        .positional("payloadFile", {
          describe:
            "Payload file containing json compatible data to be sent with the signal. Cannot be used with payload. If neither are given, uses stdin.",
          type: "string",
        })
        .option("payload", {
          describe:
            "Payload data as json string to be sent with the signal. Cannot be used with payloadFile. If neither are given, uses stdin.",
          type: "string",
          alias: "p",
        }),
    serviceAction(
      async (spinner, service, { execution, signal, payload, payloadFile }) => {
        const inputJSON = await getInputJson(
          payloadFile,
          payload,
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
