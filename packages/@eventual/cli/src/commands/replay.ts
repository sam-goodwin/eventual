import { HistoryStateEvents } from "@eventual/core";
import { Argv } from "yargs";
import { apiAction, apiOptions } from "../api-action.js";
import { prepareAndBundleOrchestrator } from "@eventual/compiler";
import path from "path";
import type { Orchestrator } from "../local-runner-entry/orchestrator.js";

export const replay = (yargs: Argv) =>
  yargs.command(
    "replay <entry> <workflow> <execution>",
    "List executions of a workflow",
    (yargs) =>
      yargs
        .options(apiOptions)
        .positional("entry", {
          describe: "Entry file",
          type: "string",
          demandOption: true,
        })
        .positional("workflow", {
          describe: "Workflow name",
          type: "string",
          demandOption: true,
        })
        .positional("execution", {
          describe: "Execution id",
          type: "string",
          demandOption: true,
        }),
    apiAction(async (spinner, ky, { entry, workflow, execution }) => {
      spinner.start("Getting history");
      const events = await ky
        .get(`workflows/${workflow}/executions/${execution}/workflow-history`)
        .json<HistoryStateEvents[]>();
      console.log(events);
      spinner.succeed();
      spinner.start("Transpiling");
      const outDir = path.join(".eventual", "cli", workflow);
      const orchestrator = await prepareAndBundleOrchestrator(outDir, {
        workflow: entry,
        orchestrator: path.join(
          new URL(import.meta.url).pathname,
          "../../local-runner-entry/orchestrator.js"
        ),
      });
      spinner.succeed();
      spinner.start("Importing program");
      const { orchestrator: program } = (await import(
        path.resolve(orchestrator)
      )) as { orchestrator: Orchestrator };
      spinner.succeed();
      spinner.start("Running program");
      const res = program(events, [], { name: "local" });
      spinner.succeed();
      console.log(res);
    })
  );
