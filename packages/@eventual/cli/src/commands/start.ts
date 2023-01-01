import { styledConsole } from "../styled-console.js";
import {
  isActivitySucceeded,
  isActivityScheduled,
  isWorkflowStarted,
  WorkflowSucceeded,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
  EventualServiceClient,
} from "@eventual/core";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import util from "util";
import { getInputJson } from "./utils.js";

export const start = (yargs: Argv) =>
  yargs.command(
    "start <service> <workflow> [inputFile]",
    "Start an execution",
    (yargs) =>
      setServiceOptions(yargs)
        .option("tail", {
          alias: "t",
          describe: "Tail execution",
          type: "boolean",
        })
        .positional("workflow", {
          describe: "Workflow name",
          type: "string",
          demandOption: true,
        })
        .positional("inputFile", {
          describe: "Input file json. If not provided, uses stdin",
          type: "string",
        })
        .option("input", {
          describe: "Input data as json string",
          type: "string",
        }),
    serviceAction(
      async (spinner, serviceClient, { workflow, input, inputFile, tail }) => {
        spinner.start(`Executing ${workflow}\n`);
        const inputJSON = await getInputJson(inputFile, input);
        // TODO: support timeout and executionName
        const { executionId } = await serviceClient.startExecution({
          workflow: workflow as string,
          input: inputJSON,
        });
        spinner.succeed(`Execution id: ${executionId}`);
        if (tail) {
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
              let meta: string | undefined;
              if (isActivitySucceeded(ev)) {
                meta = ev.result;
              } else if (isActivityScheduled(ev)) {
                meta = ev.name;
              } else if (isWorkflowStarted(ev)) {
                meta = util.inspect(ev.input);
              }
              spinner.info(
                ev.timestamp + " - " + ev.type + (meta ? `- ` + meta : "")
              );
            });
            events.push(...newEvents);
            sortEvents(events);
            const completedEvent = events.find(
              (ev) => ev.type === WorkflowEventType.WorkflowSucceeded
            );
            const failedEvent = events.find(
              (ev) => ev.type === WorkflowEventType.WorkflowFailed
            );
            if (completedEvent) {
              spinner.succeed("Workflow complete");
              const { output } = completedEvent as WorkflowSucceeded;
              if (output) {
                styledConsole.success(output);
              }
            } else if (failedEvent) {
              spinner.fail("Workflow failed");
              styledConsole.error((failedEvent as WorkflowFailed).message);
            } else {
              setTimeout(pollEvents, 1000);
            }
          }
          await pollEvents();
        } else {
          styledConsole.success({ executionId });
        }
      }
    )
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
