import { HttpEventualClient } from "@eventual/client";
import { HttpMethod, HttpRequest } from "@eventual/core";
import { LocalEnvironment } from "@eventual/core-runtime";
import express from "express";
import getPort, { portNumbers } from "get-port";
import ora from "ora";
import path from "path";
import { Argv } from "yargs";
import { setServiceOptions } from "../service-action.js";

export const local = (yargs: Argv) =>
  yargs.command(
    "local",
    "Local Eventual Dev Server",
    (yargs) =>
      setServiceOptions(yargs)
        .option("port", {
          alias: "p",
          describe:
            "Port to run the service on. Selects an open port between 3000 and 4000, unless provided.",
          default: 3000,
          type: "number",
        })
        .option("entry", {
          describe: "Entry file",
          type: "string",
          demandOption: true,
        }),
    async ({ entry, port: userPort }) => {
      const spinner = ora().start("Preparing");

      spinner.start("Starting Local Eventual Dev Server");
      const app = express();

      await import(path.resolve(entry));

      const port =
        userPort ?? (await getPort({ port: portNumbers(3000, 4000) }));
      app.listen(port);
      const url = `http://localhost:${port}`;

      const localServiceClient = new HttpEventualClient({ serviceUrl: url });

      // TODO: should the loading be done by the local env?
      const localEnv = new LocalEnvironment(localServiceClient);

      app.use(express.json({ strict: false }));

      // open up all of the user and service commands to the service.
      app.all("/*", async (req, res) => {
        const request = new HttpRequest(`${url}${req.originalUrl}`, {
          method: req.method as HttpMethod,
          body: req.body ? JSON.stringify(req.body) : undefined,
          headers: req.headers as Record<string, string>,
        });
        const resp = await localEnv.invokeCommandOrApi(request);
        res.status(resp.status);
        if (resp.statusText) {
          res.statusMessage = resp.statusText;
        }
        resp.headers.forEach((value, name) => res.setHeader(name, value));
        res.send(resp.body);
      });

      spinner.succeed(`Eventual Dev Server running on ${url}`);
    }
  );
