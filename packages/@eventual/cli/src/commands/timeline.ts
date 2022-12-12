import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import express from "express";
import getPort, { portNumbers } from "get-port";
import open from "open";
import { resolve } from "import-meta-resolve";
import {
  HistoryStateEvent,
  isActivityCompleted,
  isActivityFailed,
  isActivityScheduled,
  encodeExecutionId,
  isWorkflowStarted,
  WorkflowStarted,
} from "@eventual/core";
import path from "path";

export const timeline = (yargs: Argv) =>
  yargs.command(
    "timeline <service> <execution>",
    "Visualise execution history",
    (yargs) =>
      setServiceOptions(yargs).positional("execution", {
        describe: "Execution Id",
        type: "string",
        demandOption: true,
      }),
    serviceAction(async (spinner, ky, { execution, service }) => {
      spinner.start("Starting viz server");
      const app = express();

      app.use("/api/timeline/:execution", async (req, res) => {
        //We forward errors onto our handler for the ui to deal with
        try {
          const events = await ky
            .get(`executions/${req.params.execution}}/workflow-history`)
            .json<HistoryStateEvent[]>();
          const timeline = aggregateEvents(events);
          res.json(timeline);
        } catch (e: any) {
          res.status(500).json({ error: e.toString() });
        }
      });

      const isProduction = process.env.NODE_ENV === "production";

      if (isProduction) {
        //Serve our built site as an spa - serve js and css files out of our dist folder, otherwise just serve index.html
        app.get("*", async (request, response) => {
          const basePath = await resolveEntry("@eventual/timeline/dist");
          if (request.path.endsWith(".js") || request.path.endsWith(".css")) {
            response.sendFile(path.join(basePath, request.path));
          } else {
            response.sendFile(path.join(basePath, "index.html"));
          }
        });
      } else {
        const { createServer } = await import("vite");
        spinner.info("Using vite dev server");
        const vite = await createServer({
          server: { middlewareMode: true },
          appType: "spa",
          root: await resolveEntry("@eventual/timeline/dev"),
        });
        app.use(vite.middlewares);
      }

      const port = await getPort({ port: portNumbers(3000, 4000) });
      app.listen(port);
      const url = `http://localhost:${port}`;
      spinner.succeed(`Visualiser running on ${url}`);
      open(`${url}/${service}/${encodeExecutionId(execution)}`);
    })
  );

interface TimelineActivity {
  type: "activity";
  seq: number;
  name: string;
  start: number;
  state:
    | { status: "completed"; end: number }
    | { status: "failed"; end: number }
    | { status: "inprogress" };
}

const resolveEntry = async (entry: string) =>
  new URL(await resolve(entry, import.meta.url)).pathname;

function aggregateEvents(events: HistoryStateEvent[]): {
  start: WorkflowStarted;
  activities: TimelineActivity[];
} {
  let start: WorkflowStarted | undefined;
  const activities: Record<number, TimelineActivity> = [];
  events.forEach((event) => {
    if (isWorkflowStarted(event)) {
      start = event;
    } else if (isActivityScheduled(event)) {
      activities[event.seq] = {
        type: "activity",
        name: event.name,
        seq: event.seq,
        start: new Date(event.timestamp).getTime(),
        state: { status: "inprogress" },
      };
    } else if (isActivityCompleted(event)) {
      let existingActivity = activities[event.seq];
      if (existingActivity) {
        existingActivity.state = {
          status: "completed",
          end: new Date(event.timestamp).getTime(),
        };
      } else {
        console.log(
          `Warning: Found completion event without matching scheduled event: ${event}`
        );
      }
    } else if (isActivityFailed(event)) {
      let existingActivity = activities[event.seq];
      if (existingActivity) {
        existingActivity.state = {
          status: "failed",
          end: new Date(event.timestamp).getTime(),
        };
      } else {
        console.log(
          `Warning: Found failure event without matching scheduled event: ${event}`
        );
      }
    }
  });
  if (!start) {
    throw new Error("Failed to find WorkflowStarted event!");
  }
  return { start, activities: Object.values(activities) };
}