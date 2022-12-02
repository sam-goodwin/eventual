import { encodeExecutionId } from "@eventual/aws-runtime";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const history = (yargs: Argv) =>
  yargs.command(
    "history <service> <execution>",
    "Get execution history",
    (yargs) =>
      setServiceOptions(yargs).positional("execution", {
        describe: "Execution Id",
        type: "string",
        demandOption: true,
      }),
    serviceAction(async (spinner, ky, { execution }) => {
      spinner.start("Getting execution history");
      const events = await ky
        .get(`executions/${encodeExecutionId(execution)}}/history`)
        .json();
      spinner.succeed();
      console.log(events);
    })
  );
