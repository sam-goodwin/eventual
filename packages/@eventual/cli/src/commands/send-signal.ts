import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJson } from "./utils.js";

export const sendSignal = (yargs: Argv) =>
  yargs.command(
    "signal",
    "Send a signal to a running execution",
    (yargs) =>
      setServiceOptions(yargs)
        .option("execution", {
          alias: "e",
          describe: "Execution id",
          type: "string",
          demandOption: true,
        })
        .option("signal", {
          describe: "Signal Id",
          type: "string",
          demandOption: true,
        })
        .option("payloadFile", {
          alias: "f",
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
