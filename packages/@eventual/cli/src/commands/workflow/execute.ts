import { apiAction, apiCommand } from "../../api-action.js";
import { styledConsole } from "../../styled-console.js";
import {
  isActivityCompleted,
  isActivityScheduled,
  isWorkflowStarted,
  WorkflowCompleted,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
} from "@eventual/core";
import { KyInstance } from "../../types.js";

export const execute = apiCommand("execute")
  .description("Execute an Eventual workflow")
  .option("-t, --tail", "Tail execution")
  .argument("<name>", "Workflow name")
  .argument("[parameters...]", "Workflow parameters")
  .action(
    apiAction(async (spinner, ky, name, parameters, options) => {
      spinner.start(`Executing ${name}\n`);
      const { executionId } = await ky
        .post(`workflows/${name}/executions`, { json: parameters })
        .json<{ executionId: string }>();
      spinner.succeed(`Execution id: ${executionId}`);
      if (options.tail) {
        let events: WorkflowEvent[] = [];
        if (!spinner.isSpinning) {
          spinner.start(`${executionId} in progress\n`);
        }
        async function pollEvents() {
          const newEvents = await getNewEvents(events, ky, name, executionId);
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
            styledConsole.success((completedEvent as WorkflowCompleted).output);
          } else if (failedEvent) {
            spinner.fail("Workflow failed");
            styledConsole.error((failedEvent as WorkflowFailed).error);
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
