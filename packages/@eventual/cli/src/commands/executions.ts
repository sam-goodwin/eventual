import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import {
  EventualServiceClient,
  ExecutionStatus,
  SortOrder,
} from "@eventual/core";
import { displayExecution } from "../display/execution.js";

export const listExecutions = (yargs: Argv) =>
  yargs.command(
    "executions",
    "List executions of a service, or optionally, a workflow",
    (yargs) =>
      setServiceOptions(yargs, true)
        .option("workflow", {
          alias: "w",
          describe: "Workflow name",
          type: "string",
        })
        .option("in-progress", {
          alias: ["inprogress"],
          describe:
            "Return in progress workflows. When provided only explicitly provided status will be returned.",
          type: "boolean",
        })
        .option("succeeded", {
          describe:
            "Return succeeded executions. When provided only explicitly provided status will be returned.",
          type: "boolean",
        })
        .option("failed", {
          describe:
            "Return failed executions. When provided only explicitly provided status will be returned.",
          type: "boolean",
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
          default: 100,
        }),
    (args) => {
      return serviceAction(
        // FORMATTED
        async (spinner, service) => {
          spinner.start("Getting executions");

          const { executions } = await getExecutions(service);
          if (!args.desc) {
            // we always ask for the most recent executions, asc will just show them in reverse
            executions.reverse();
          }
          spinner.stop();
          executions.forEach((execution) => {
            process.stdout.write(
              `${displayExecution(execution, {
                results: false,
                workflow: false,
              })}\n\n`
            );
          });
        },
        // JSON
        async (service) => {
          const executions = await getExecutions(service);

          process.stdout.write(JSON.stringify(executions));
          process.stdout.write("\n");
        }
      )(args);

      async function getExecutions(service: EventualServiceClient) {
        const statuses = [
          args.inprogress ? ExecutionStatus.IN_PROGRESS : undefined,
          args.succeeded ? ExecutionStatus.SUCCEEDED : undefined,
          args.failed ? ExecutionStatus.FAILED : undefined,
        ].filter((s): s is ExecutionStatus => !!s);

        return service.getExecutions({
          workflowName: args.workflow,
          sortDirection: SortOrder.Desc,
          maxResults: args.maxResults ?? 100,
          statuses: statuses.length > 0 ? statuses : undefined,
          nextToken: args.nextToken,
        });
      }
    }
  );
