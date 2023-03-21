import { HttpMethod, HttpRequest } from "@eventual/core";
import { LocalEnvironment } from "@eventual/core-runtime";
import { discoverEventualConfig, exec } from "@eventual/project";
import { exec as _exec } from "child_process";
import express from "express";
import ora from "ora";
import path from "path";
import { promisify } from "util";
import { Argv } from "yargs";
import { assumeCliRole } from "../role.js";
import { setServiceOptions } from "../service-action.js";
import {
  getBuildManifest,
  getServiceData,
  isServiceDeployed,
  tryResolveDefaultService,
} from "../service-data.js";
const execPromise = promisify(_exec);

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
        .option("update", {
          describe: "The update mode: first, never, always",
          choices: ["first", "never", "always"],
          default: "first",
          type: "string",
        }),
    async ({ port: userPort, update, service, region }) => {
      const spinner = ora();
      spinner.start("Starting Local Eventual Dev Server");
      process.env.EVENTUAL_LOCAL = "1";

      const serviceNameFirst = await tryResolveDefaultService(service);

      const config = await discoverEventualConfig();

      // if the service name is not found, try to generate one
      if (!serviceNameFirst) {
        spinner.text =
          "No service name found, running synth to try to generate one.";
        if (!config) {
          spinner.fail("No eventual config (eventual.json) found...");
          process.exit(1);
        }
        await execPromise(config.synth);
      }

      const serviceName = await tryResolveDefaultService(serviceNameFirst);

      if (!serviceName) {
        throw new Error("Service name was not found after synth.");
      }

      const isDeployed = await isServiceDeployed(serviceName, region);

      if ((!isDeployed && update === "first") || update === "always") {
        spinner.text = "Deploying CDK";
        if (!config) {
          spinner.fail("No eventual config (eventual.json) found...");
          process.exit(1);
        }
        await exec(config.deploy);
      }

      const buildManifest = await getBuildManifest(serviceName);

      const credentials = await assumeCliRole(serviceName, region);
      const serviceData = await getServiceData(
        credentials,
        serviceName,
        region
      );

      if (serviceData.environmentVariables) {
        Object.entries(serviceData.environmentVariables).forEach(
          ([name, val]) => (process.env[name] = val)
        );
      }

      // get from build manifest
      await import(path.resolve(buildManifest.entry));

      const port = userPort;
      const app = express();
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
