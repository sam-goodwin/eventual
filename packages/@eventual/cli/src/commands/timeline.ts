import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import express from "express";
import getPort, { portNumbers } from "get-port";
import open from "open";
import { resolve } from "import-meta-resolve";
import { HistoryStateEvent, encodeExecutionId } from "@eventual/core";
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

      //Proxy the workflow-history api, without authentication, for hte ui to use
      app.use(
        "/api/executions/:execution/workflow-history",
        async (req, res) => {
          //We forward errors onto our handler for the ui to deal with
          try {
            const events = await ky
              .get(`executions/${req.params.execution}}/workflow-history`)
              .json<HistoryStateEvent[]>();
            res.json(events);
          } catch (e: any) {
            res.status(500).json({ error: e.toString() });
          }
        }
      );

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

const resolveEntry = async (entry: string) =>
  new URL(await resolve(entry, import.meta.url)).pathname;
