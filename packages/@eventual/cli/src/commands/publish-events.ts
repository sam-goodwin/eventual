import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJsonArray } from "./utils.js";

export const publishEvents = (yargs: Argv) =>
  yargs.command(
    "events <service> <event>",
    "Send one or more events to the service",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("event", {
          describe: "Event Id",
          type: "string",
          demandOption: true,
        })
        .option("payloadFile", {
          alias: "pf",
          describe: "A return delimited file containing event payloads",
          type: "string",
        })
        .option("payload", {
          describe:
            "Payload data as json string to be sent with the signal. Cannot be used with payloadFile. If neither are given, uses stdin.",
          type: "string",
          alias: "p",
          array: true,
        }),
    serviceAction(async (spinner, service, { event, payload, payloadFile }) => {
      spinner.start("Publish Event");
      const inputPayloads = await getInputJsonArray(
        payloadFile,
        payload,
        "payloadFile",
        "payload"
      );

      await service.publishEvents({
        events: inputPayloads.map((payload) => ({
          event: payload,
          name: event,
        })),
      });
      spinner.stop();
    })
  );
