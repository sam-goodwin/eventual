import { HttpMethod } from "@eventual/client";
import {
  encodeExecutionId,
  // HistoryStateEvent,
  // isActivityFailed,
  // isActivityScheduled,
  // isActivitySucceeded,
  // isWorkflowStarted,
  // WorkflowStarted,
} from "@eventual/core";
import express from "express";
import getPort, { portNumbers } from "get-port";
import { resolve } from "import-meta-resolve";
import open from "open";
import path from "path";
import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const timeline = (yargs: Argv) =>
  yargs.command(
    "timeline",
    "Visualize execution history",
    (yargs) =>
      setServiceOptions(yargs).option("execution", {
        alias: "e",
        describe: "Execution Id",
        type: "string",
        demandOption: true,
      }),
    serviceAction(async (spinner, serviceClient, { execution, service }) => {
      spinner.start("Starting viz server");
      const app = express();

      app.use("/api/*", async (req, res) => {
        // We forward errors onto our handler for the ui to deal with
        const path = req.path.split("/").slice(1).join("/");
        try {
          res.json(
            await serviceClient.proxy({
              method: req.method as HttpMethod,
              path,
              body: req.body,
            })
          );
        } catch (e: any) {
          res.status(500).json({ error: e.toString() });
        }
      });

      const isProduction = process.env.NODE_ENV === "production";

      if (isProduction) {
        // Serve our built site as an spa - serve js and css files out of our dist folder, otherwise just serve index.html
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

// interface TimelineActivity {
//   type: "activity";
//   seq: number;
//   name: string;
//   start: number;
//   state:
//     | { status: "succeeded"; end: number }
//     | { status: "failed"; end: number }
//     | { status: "inprogress" };
// }

const resolveEntry = async (entry: string) =>
  new URL(await resolve(entry, import.meta.url)).pathname;

// function aggregateEvents(events: HistoryStateEvent[]): {
//   start: WorkflowStarted;
//   activities: TimelineActivity[];
// } {
//   let start: WorkflowStarted | undefined;
//   const activities: Record<number, TimelineActivity> = [];
//   events.forEach((event) => {
//     if (isWorkflowStarted(event)) {
//       start = event;
//     } else if (isActivityScheduled(event)) {
//       activities[event.seq] = {
//         type: "activity",
//         name: event.name,
//         seq: event.seq,
//         start: new Date(event.timestamp).getTime(),
//         state: { status: "inprogress" },
//       };
//     } else if (isActivitySucceeded(event)) {
//       const existingActivity = activities[event.seq];
//       if (existingActivity) {
//         existingActivity.state = {
//           status: "succeeded",
//           end: new Date(event.timestamp).getTime(),
//         };
//       } else {
//         console.log(
//           `Warning: Found completion event without matching scheduled event: ${event}`
//         );
//       }
//     } else if (isActivityFailed(event)) {
//       const existingActivity = activities[event.seq];
//       if (existingActivity) {
//         existingActivity.state = {
//           status: "failed",
//           end: new Date(event.timestamp).getTime(),
//         };
//       } else {
//         console.log(
//           `Warning: Found failure event without matching scheduled event: ${event}`
//         );
//       }
//     }
//   });
//   if (!start) {
//     throw new Error("Failed to find WorkflowStarted event!");
//   }
//   return { start, activities: Object.values(activities) };
// }
