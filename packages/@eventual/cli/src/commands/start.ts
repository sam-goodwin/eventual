import { styledConsole } from "../styled-console.js";
import {
  isActivityCompleted,
  isActivityScheduled,
  isWorkflowStarted,
  WorkflowCompleted,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
} from "@eventual/core";
import { KyInstance } from "../types.js";
import fs from "fs/promises";
import getStdin from "get-stdin";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

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
    serviceAction(async (spinner, ky, { workflow, input, inputFile, tail }) => {
      spinner.start(`Executing ${workflow}\n`);
      let inputJSON = await getInputJson(inputFile, input);
      const { executionId } = await ky
        .post(`workflows/${workflow}/executions`, {
          json: inputJSON,
        })
        .json<{ executionId: string }>();
      spinner.succeed(`Execution id: ${executionId}`);
      if (tail) {
        let events: WorkflowEvent[] = [];
        if (!spinner.isSpinning) {
          spinner.start(`${executionId} in progress\n`);
        }
        async function pollEvents() {
          const newEvents = await getNewEvents(
            events,
            ky,
            workflow,
            executionId
          );
          newEvents.forEach((ev) => {
            let meta: string | undefined;
            if (isActivityCompleted(ev)) {
              meta = ev.result;
            } else if (isActivityScheduled(ev)) {
              meta = ev.name;
            } else if (isWorkflowStarted(ev)) {
              meta = ev.input;
            }
            spinner.info(
              ev.timestamp + " - " + ev.type + (meta ? `- ` + meta : "")
            );
          });
          events.push(...newEvents);
          const completedEvent = events.find(
            (ev) => ev.type === WorkflowEventType.WorkflowCompleted
          );
          const failedEvent = events.find(
            (ev) => ev.type === WorkflowEventType.WorkflowFailed
          );
          if (completedEvent) {
            spinner.succeed("Workflow complete");
            const { output } = completedEvent as WorkflowCompleted;
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
    })
  );

/**
 * Fetch events, and return ones that we haven't seen already
 */
async function getNewEvents(
  existingEvents: WorkflowEvent[],
  ky: KyInstance,
  workflowName: string,
  executionId: string
) {
  const updatedEvents = await ky(
    `workflows/${workflowName}/executions/${executionId}`
  ).json<WorkflowEvent[]>();
  if (updatedEvents.length == 0) {
    //Unfortunately if the execution id is wrong, our dynamo query is just going to return an empty record set
    //Not super helpful
    //So we use this heuristic to give up, since we should at least have a start event.
    throw new Error("No events at all. Check your execution id");
  }
  return updatedEvents.slice(existingEvents.length);
}

/**
 * Get input json from specified file, otherwise stdin
 * @param inputFile file to read from
 * @returns parsed json. Will be empty object if no input was given
 */
async function getInputJson(
  inputFile: string | undefined,
  input: string | undefined
): Promise<any> {
  if (inputFile) {
    return JSON.parse(await fs.readFile(inputFile, { encoding: "utf-8" }));
  } else if (input) {
    return JSON.parse(input);
  } else {
    const stdin = await getStdin();
    return stdin.length === 0 ? {} : JSON.parse(stdin);
  }
}
