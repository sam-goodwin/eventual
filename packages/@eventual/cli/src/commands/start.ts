import { styledConsole } from "../styled-console.js";
import {
  WorkflowSucceeded,
  WorkflowEvent,
  WorkflowFailed,
  EventualServiceClient,
  isWorkflowSucceeded,
  isWorkflowFailed,
  isWorkflowCompleted,
} from "@eventual/core";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { getInputJson } from "./utils.js";
import { displayEvent } from "../display/execution.js";

export const start = (yargs: Argv) =>
  yargs.command(
    "workflow <workflow>",
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
        .option("input", {
          alias: "i",
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
        }),
    (args) => {
      return serviceAction(
        async (spinner, serviceClient) => {
          spinner.start(`Executing ${args.workflow}\n`);
          const { executionId } = await startExecution(serviceClient);
          spinner.succeed(`Execution id: ${executionId}`);
          if (args.follow) {
            const events: WorkflowEvent[] = [];
            if (!spinner.isSpinning) {
              spinner.start(`${executionId} in progress\n`);
            }
            async function pollEvents() {
              const newEvents = await getNewEvents(
                events,
                serviceClient,
                executionId
              );
              newEvents.forEach((ev) => {
                spinner.info(displayEvent(ev));
              });
              events.push(...newEvents);
              sortEvents(events);
              const completedEvent = events.find(isWorkflowCompleted);
              if (completedEvent) {
                if (isWorkflowSucceeded(completedEvent)) {
                  spinner.succeed("Workflow succeeded");
                  const { output } = completedEvent as WorkflowSucceeded;
                  if (output) {
                    styledConsole.success(output);
                  }
                } else if (isWorkflowFailed(completedEvent)) {
                  spinner.fail("Workflow failed");
                  styledConsole.error(
                    (completedEvent as WorkflowFailed).message
                  );
                }
              } else {
                setTimeout(pollEvents, 1000);
              }
            }
            await pollEvents();
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
          timeoutSeconds: args.timeout,
        });
      }
    }
  );

/**
 * Fetch events, and return ones that we haven't seen already
 */
async function getNewEvents(
  existingEvents: WorkflowEvent[],
  serviceClient: EventualServiceClient,
  executionId: string
) {
  // TODO: make this work with pagination instead of pulling all of the events.
  const { events: updatedEvents } = await serviceClient.getExecutionHistory({
    executionId,
  });
  if (updatedEvents.length === 0) {
    // Unfortunately if the execution id is wrong, our dynamo query is just going to return an empty record set
    // Not super helpful
    // So we use this heuristic to give up, since we should at least have a start event.
    throw new Error("No events at all. Check your execution id");
  }
  // The sort is important to ensure we don't chop off new events,
  // as we cannot rely on the event log to be sorted.
  // ie a later event may be be output into the history before events we have previously seen.
  sortEvents(updatedEvents);
  return updatedEvents.slice(existingEvents.length);
}

function sortEvents(events: WorkflowEvent[]) {
  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}
