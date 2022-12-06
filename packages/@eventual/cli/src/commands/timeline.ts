import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import express from "express";
import { createServer as createViteServer } from "vite";
import getPort, { portNumbers } from "get-port";
import open from "open";
import { resolve } from "import-meta-resolve";
import { encodeExecutionId } from "@eventual/aws-runtime";
import {
  HistoryStateEvent,
  isActivityCompleted,
  isActivityScheduled,
} from "@eventual/core";

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
    serviceAction(async (spinner, ky, { execution }) => {
      spinner.start("Starting viz server");
      const app = express();

      app.use("/timeline", async (_req, res) => {
        const events = await ky
          .get(`executions/${encodeExecutionId(execution)}}/workflow-history`)
          .json<HistoryStateEvent[]>();
        const timeline = aggregateTimeline(events);
        res.send(timeline);
      });

      const timelineVizPath = new URL(
        await resolve("@eventual/timeline-viz", import.meta.url)
      ).pathname;
      console.log(timelineVizPath);

      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
        root: timelineVizPath,
      });

      app.use(vite.middlewares);

      const port = await getPort({ port: portNumbers(3000, 4000) });
      app.listen(port);
      const url = `http://localhost:${port}`;
      spinner.succeed(`Visualiser running on ${url}`);
      open(url);

      // spinner.start("Getting execution history");
      // spinner.succeed();
      // console.log(events);
    })
  );

interface TimelineActivity {
  type: "activity";
  seq: number;
  name: string;
  start: Date;
  status: { completed: number } | { failed: Date } | { inprogress: true };
}

function aggregateTimeline(events: HistoryStateEvent[]): TimelineActivity[] {
  const activities: Record<number, TimelineActivity> = [];
  events.forEach((event) => {
    if (isActivityScheduled(event)) {
      activities[event.seq] = {
        type: "activity",
        name: event.name,
        seq: event.seq,
        start: new Date(event.timestamp),
        status: { inprogress: true },
      };
    } else if (isActivityCompleted(event)) {
      let existingActivity = activities[event.seq];
      if (existingActivity) {
        existingActivity.status = { completed: event.duration };
      } else {
        console.log(
          `Warning: Found completion event without matching scheduled event: ${event}`
        );
      }
    }
  });
  return Object.values(activities);
}
