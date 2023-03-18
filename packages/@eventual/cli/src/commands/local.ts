import { HttpMethod, HttpRequest } from "@eventual/core";
import { LocalEnvironment } from "@eventual/core-runtime";
import express from "express";
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
          describe: "Port to run the service on.",
          default: 3111,
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

      const port = userPort;
      app.listen(port);
      const url = `http://localhost:${port}`;

      // TODO: should the loading be done by the local env?
      const localEnv = new LocalEnvironment();

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
