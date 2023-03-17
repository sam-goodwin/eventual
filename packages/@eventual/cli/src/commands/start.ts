import {
  DurationUnit,
  DURATION_UNITS,
  EventualServiceClient,
  ListExecutionEventsResponse,
  Schedule,
} from "@eventual/core";
import { isWorkflowFailed, isWorkflowSucceeded } from "@eventual/core/internal";
import { Argv } from "yargs";
import { displayEvent } from "../display/event.js";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { styledConsole } from "../styled-console.js";
import { getInputJson } from "./utils.js";

export const start = (yargs: Argv) =>
  yargs.command(
    "workflow <workflow> [input]",
    "Start an workflow",
    (yargs) =>
      setServiceOptions(yargs, true)
        .positional("workflow", {
          describe: "Workflow name",
          type: "string",
          demandOption: true,
        })
        .option("follow", {
          alias: "f",
          describe: "Follow an execution",
          type: "boolean",
          conflicts: "json",
        })
        .option("inputFile", {
          alias: "x",
          describe: "Input file json. If not provided, uses stdin",
          type: "string",
        })
        .positional("input", {
          describe: "Input data as json string",
          type: "string",
        })
        .option("name", {
          alias: "n",
          describe:
            "Unique name of the execution. Must be unique for all executions of the workflow.",
          type: "string",
          defaultDescription: "An auto generated UUID",
        })
        .option("timeout", {
          describe: "Number of seconds until the execution times out.",
          type: "number",
          defaultDescription:
            "Configured on the workflow definition or no timeout.",
        })
        .option("timeoutUnit", {
          describe: "Number of seconds until the execution times out.",
          type: "string",
          choices: DURATION_UNITS,
          default: "seconds",
        }),
    (args) => {
      return serviceAction(
        async (spinner, serviceClient) => {
          spinner.start(`Executing ${args.workflow}\n`);
          const { executionId } = await startExecution(serviceClient);
          spinner.succeed(`Execution id: ${executionId}`);
          if (args.follow) {
            if (!spinner.isSpinning) {
              spinner.start(`${executionId} in progress\n`);
            }
            for await (const event of streamEvents(
              serviceClient,
              executionId
            )) {
              spinner.info(displayEvent(event));
              if (isWorkflowSucceeded(event)) {
                spinner.succeed("Workflow succeeded");
                const { output } = event;
                if (output) {
                  styledConsole.success(output);
                }
                break;
              } else if (isWorkflowFailed(event)) {
                spinner.fail("Workflow failed");
                styledConsole.error(`${event.error}: ${event.message}`);
                break;
              }
            }
          }
        },
        async (serviceClient) => {
          const { executionId } = await startExecution(serviceClient);

          process.stdout.write(JSON.stringify({ executionId }));
          process.stdout.write("\n");
        }
      )(args);

      async function startExecution(serviceClient: EventualServiceClient) {
        const inputJSON = await getInputJson(args.inputFile, args.input);
        return await serviceClient.startExecution({
          workflow: args.workflow,
          input: inputJSON,
          executionName: args.name,
          timeout: args.timeout
            ? Schedule.duration(args.timeout, args.timeoutUnit as DurationUnit)
            : undefined,
        });
      }
    }
  );

async function* streamEvents(
  serviceClient: EventualServiceClient,
  executionId: string
) {
  let maxTime: string | undefined;
  let nextToken: string | undefined;

  do {
    const res: ListExecutionEventsResponse =
      await serviceClient.getExecutionHistory({
        executionId,
        // if there is a next token, continue, or else ask for events after the last one we saw
        ...(nextToken ? { nextToken } : { after: maxTime }),
      });
    yield* res.events;
    // track the max time of events we have seen so the next request can start there.
    maxTime =
      res.events.length > 0
        ? res.events[res.events.length - 1]!.timestamp
        : maxTime;
    nextToken = res.nextToken;
    // if there are more events to retrieve, do not wait
    if (!nextToken) {
      // between batches, wait 1 second for new events
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } while (true);
}
