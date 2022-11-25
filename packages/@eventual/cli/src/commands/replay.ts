import { HistoryStateEvent } from "@eventual/core";
import { Argv } from "yargs";
import { bundleWorkflow } from "@eventual/compiler";
import path from "path";
import { orchestrator } from "../replay/orchestrator.js";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { encodeExecutionId } from "@eventual/aws-runtime";

export const replay = (yargs: Argv) =>
  yargs.command(
    "replay <service> <execution> <entry>",
    "List executions of a workflow",
    (yargs) =>
      setServiceOptions(yargs)
        .positional("execution", {
          describe: "Execution id",
          type: "string",
          demandOption: true,
        })
        .positional("entry", {
          describe: "Entry file",
          type: "string",
          demandOption: true,
        }),
    serviceAction(async (spinner, ky, { entry, service, execution }) => {
      spinner.start("Getting history");
      const encodedExecutionId = encodeExecutionId(execution);
      const events = await ky
        .get(`executions/${encodedExecutionId}/workflow-history`)
        .json<HistoryStateEvent[]>();
      console.log(events);
      spinner.succeed();
      console.log(process.env.NODE_PATH);
      spinner.start("Compiling workflow");
      const outDir = path.join(".eventual", "cli", service, encodedExecutionId);

      const workflowPath = await bundleWorkflow(outDir, entry);
      spinner.succeed();
      spinner.start("Importing program");

      const { default: workflowProgram } = await import(
        path.resolve(workflowPath)
      );
      spinner.succeed();
      spinner.start("Running program");
      //Dodgy, but vscode needs a bit of time to pick up the newly created file and sourcemap
      await sleep(500);
      console.log(workflowProgram);
      const res = orchestrator(workflowProgram, events);
      spinner.succeed();
      console.log(res);
    })
  );

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
