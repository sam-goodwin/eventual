import { EventualServiceClient, ExecutionID, SortOrder } from "@eventual/core";
import { Argv } from "yargs";
import { displayEvent } from "../display/event.js";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const history = (yargs: Argv) =>
  yargs.command(
    "history",
    "Get execution history",
    (yargs) =>
      setServiceOptions(yargs, true)
        .option("execution", {
          alias: "e",
          describe: "Execution id",
          type: "string",
          demandOption: true,
        })
        .option("nextToken", {
          describe:
            "With --json only. Give the next token provided in the last payload to get more results.",
          type: "string",
          implies: "json",
        })
        .option("desc", {
          describe: "Display executions in deceasing order",
          type: "boolean",
          defaultDescription: "Ascending Order",
        })
        .option("maxResults", {
          alias: "n",
          describe: "Number of items to return",
          type: "number",
          default: 1000,
        })
        .option("after", {
          describe:
            "ISO 8601 date or numeric timestamp after which all events should have happened.",
          type: "string",
        }),
    (args) => {
      return serviceAction(
        // FORMATTED
        async (spinner, serviceClient) => {
          spinner.start("Getting execution history");
          const { events } = await getExecutionHistory(serviceClient);
          spinner.succeed();
          events.forEach((e) => {
            process.stdout.write(displayEvent(e));
            process.stdout.write("\n");
          });
        },
        // JSON
        async (serviceClient) => {
          const history = await getExecutionHistory(serviceClient);

          process.stdout.write(JSON.stringify(history));
          process.stdout.write("\n");
        }
      )(args);

      async function getExecutionHistory(serviceClient: EventualServiceClient) {
        return await serviceClient.getExecutionHistory({
          executionId: args.execution as ExecutionID,
          nextToken: args.nextToken,
          maxResults: args.maxResults,
          sortDirection: args.desc ? SortOrder.Desc : SortOrder.Asc,
          after: args.after,
        });
      }
    }
  );
