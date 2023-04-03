import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJsonArray } from "./utils.js";

export const emitEvents = (yargs: Argv) =>
  yargs.command(
    "events <event> [input]",
    "Send one or more events to the service",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("event", {
          describe: "Event Id",
          type: "string",
          demandOption: true,
        })
        .option("inputFile", {
          alias: "f",
          describe: "A return delimited file containing event payloads",
          type: "string",
        })
        .positional("input", {
          describe:
            "Payload data as json string to be sent with the signal. Cannot be used with payloadFile. If neither are given, uses stdin.",
          type: "string",
          array: true,
        }),
    serviceAction(async (spinner, service, { event, input, inputFile }) => {
      spinner.start("Emit Event");
      const inputPayloads = await getInputJsonArray(
        inputFile,
        input,
        "payloadFile",
        "payload"
      );

      await service.emitEvents({
        events: inputPayloads.map((payload) => ({
          event: payload,
          name: event,
        })),
      });
      spinner.stop();
    })
  );
