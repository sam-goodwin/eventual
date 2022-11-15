import { Command } from "commander";
import { withApiAction } from "../../api-action.js";
import ora, { Ora } from "ora";
import cliSpinners from "cli-spinners";
import { KyInstance } from "ky/distribution/types/ky";
import { styledConsole } from "../../styled-console.js";
import { HistoryStateEvents, WorkflowEventType } from "@eventual/core";

const command = new Command("execute")
  .description("Execute an Eventual workflow")
  .option("-t, --tail", "Tail execution")
  .argument("<name>", "Workflow name")
  .argument("[parameters...]", "Workflow parameters");

let spinner: Ora;
let workflowInProgess = true;
export const execute = withApiAction(
  command,
  async (ky, name, parameters, options) => {
    console.group(name, parameters, options);
    spinner = ora({
      text: `Executing ${name}\n`,
      spinner: cliSpinners.aesthetic,
    }).start();
    const { executionId } = await ky
      .post(`workflows/${name}/executions`)
      .json<{ executionId: string }>();
    spinner.succeed(`Execution id: ${executionId}`);
    if (options.tail) {
      let events: HistoryStateEvents[] = [];
      while (workflowInProgess) {
        spinner.start(`${executionId} in progress\n`);
        events.push(
          ...(await logEvents(events, ky, name, executionId, spinner))
        );
        //Stop tailing once we detect the workflow has completed
        if (
          events.find((ev) =>
            [
              WorkflowEventType.WorkflowCompleted,
              WorkflowEventType.WorkflowFailed,
            ].includes(ev.type)
          )
        ) {
          workflowInProgess = false;
        }
      }
    } else {
      styledConsole.success({ executionId });
    }
  },
  () => {
    workflowInProgess = false;
    spinner.fail();
  }
);

async function logEvents(
  events: HistoryStateEvents[],
  ky: KyInstance,
  workflowName: string,
  executionId: string,
  spinner: Ora
) {
  const updatedEvents = await ky(
    `workflows/${workflowName}/executions/${executionId}`
  ).json<HistoryStateEvents[]>();
  const newEvents = updatedEvents.slice(events.length);
  newEvents.forEach((ev) => {
    spinner.info(`${ev.timestamp} - ${ev.type}`);
  });
  return updatedEvents;
}
