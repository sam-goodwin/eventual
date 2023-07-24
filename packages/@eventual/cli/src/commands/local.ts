import { inferFromMemory } from "@eventual/compiler";
import { HttpMethod, HttpRequest } from "@eventual/core";
import { LocalEnvironment } from "@eventual/core-runtime";
import { ServiceSpec } from "@eventual/core/internal";
import { EventualConfig, discoverEventualConfig } from "@eventual/project";
import { exec as _exec } from "child_process";
import express from "express";
import ora, { Ora } from "ora";
import path from "path";
import { promisify } from "util";
import { Argv } from "yargs";
import { assumeCliRole } from "../role.js";
import { setServiceOptions } from "../service-action.js";
import {
  getBuildManifest,
  getServiceData,
  getServiceSpec,
  isServiceDeployed,
  resolveRegion,
  tryGetBuildManifest,
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
        .option("maxBodySize", {
          describe: "Replace the default body size limit of 100kb.",
          default: "100kb",
          type: "string",
        })
        .option("update", {
          describe: "The update mode: first, never, always",
          choices: ["first", "never", "always"],
          default: "first",
          type: "string",
        }),
    async ({ port: userPort, update, service, region, maxBodySize }) => {
      const spinner = ora();
      spinner.start("Starting Local Eventual Dev Server");
      process.env.EVENTUAL_LOCAL = "1";

      region = region ?? (await resolveRegion());

      const config = await discoverEventualConfig();

      if (!config) {
        spinner.fail("No eventual config (eventual.json) found...");
        process.exit(1);
      }

      const buildManifest = await resolveManifestLocal(
        spinner,
        config,
        service
      );

      const isDeployed = await isServiceDeployed(
        buildManifest.serviceName,
        region
      );

      if ((!isDeployed && update === "first") || update === "always") {
        spinner.text = "Deploying CDK";
        await execPromise(config.deploy);
      }

      const credentials = await assumeCliRole(
        buildManifest.serviceName,
        region
      );
      process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
      process.env.AWS_SESSION_TOKEN = credentials.sessionToken;
      const serviceData = await getServiceData(
        credentials,
        buildManifest.serviceName,
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

      const url = `http://localhost:${port}`;

      // get the stored spec file to load values from synth
      const storedServiceSpec = await getServiceSpec(
        config.outDir,
        buildManifest.serviceName
      );
      // infer from memory instead of from file to ensure the spec is up to date without synth.
      const serviceSpec: ServiceSpec = inferFromMemory(
        storedServiceSpec.openApi
      );

      // TODO: should the loading be done by the local env?
      const localEnv = new LocalEnvironment({
        serviceSpec,
        serviceUrl: url,
        serviceName: buildManifest.serviceName,
      });

      app.use(express.json({ strict: false, limit: maxBodySize }));
      // CORS for local
      app.use((req, res, next) => {
        next();

        const headers = res.getHeaders();
        if (!headers["Access-Control-Allow-Origin"]) {
          res.header("Access-Control-Allow-Origin", req.headers.origin ?? "*");
        }
        if (!headers["Access-Control-Allow-Methods"]) {
          res.header("Access-Control-Allow-Methods", "*");
        }
        if (!headers["Access-Control-Allow-Headers"]) {
          res.header("Access-Control-Allow-Headers", "*");
        }
        if (!headers["Access-Control-Allow-Credentials"]) {
          res.header("Access-Control-Allow-Credentials", "true");
        }
      });

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

      app.listen(port, () => {
        process.send?.("ready");
      });

      spinner.succeed(`Eventual Dev Server running on ${url}`);
    }
  );

/**
 * Retrieve the build manifest in a local environment.
 *
 * Does a synth if needed.
 */
export async function resolveManifestLocal(
  spinner: Ora,
  config: EventualConfig,
  service?: string
) {
  const serviceNameFirst = await tryResolveDefaultService(
    config.outDir,
    service
  );

  // if the service name is not found, try to generate one
  if (!serviceNameFirst) {
    spinner.text =
      "No service name found, running synth to try to generate one.";
    await execPromise(config.synth);
  }

  const serviceName = await tryResolveDefaultService(
    config.outDir,
    serviceNameFirst
  );

  if (!serviceName) {
    throw new Error("Service name was not found after synth.");
  }

  const manifest = await tryGetBuildManifest(config.outDir, serviceName);
  if (manifest === undefined) {
    spinner.text =
      "Service manifest not found, running synth to try to generate one.";
    await execPromise(config.synth);
    return getBuildManifest(config.outDir, serviceName);
  } else {
    return manifest;
  }
}
