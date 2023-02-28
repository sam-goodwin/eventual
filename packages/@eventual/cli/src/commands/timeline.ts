import { createAwsHttpRequestSigner } from "@eventual/aws-client";
import { HttpServiceClient } from "@eventual/client";
import { HttpMethod } from "@eventual/core";
import { encodeExecutionId } from "@eventual/core/internal";
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
    serviceAction(
      async (
        spinner,
        _,
        { execution, service },
        { credentials, serviceData }
      ) => {
        spinner.start("Starting viz server");
        const app = express();

        const client = new HttpServiceClient({
          serviceUrl: serviceData.apiEndpoint,
          beforeRequest: createAwsHttpRequestSigner({ credentials }),
        });

        app.use("/api/*", async (req, res) => {
          // We forward errors onto our handler for the ui to deal with
          const path = req.baseUrl.split("/").slice(2).join("/");
          try {
            res.json(
              await client.request({
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

        console.log(isProduction);

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
        spinner.succeed(`Visualizer running on ${url}`);
        open(`${url}/${service}/${encodeExecutionId(execution)}`);
      }
    )
  );

const resolveEntry = async (entry: string) =>
  new URL(await resolve(entry, import.meta.url)).pathname;
