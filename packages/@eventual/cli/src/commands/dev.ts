import { HttpEventualClient } from "@eventual/client";
import { inferLoadedService, loadService } from "@eventual/compiler";
import { EventualServiceClient, HttpMethod, HttpRequest } from "@eventual/core";
import {
  createCommandWorker,
  createListWorkflowsCommand,
  createPublishEventsCommand,
  createSubscriptionWorker,
  GlobalSubscriptionProvider,
  ServiceSpecWorkflowProvider,
} from "@eventual/core-runtime";
import { ServiceSpec } from "@eventual/core/internal";
import express from "express";
import getPort, { portNumbers } from "get-port";
import { Argv } from "yargs";
import { LocalEventClient } from "../local/event-client.js";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const dev = (yargs: Argv) =>
  yargs.command(
    "dev",
    "Local Eventual Dev Server",
    (yargs) =>
      setServiceOptions(yargs)
        .option("port", {
          alias: "p",
          describe: "port to run the service on",
          type: "number",
        })
        .option("entry", {
          describe: "Entry file",
          type: "string",
          demandOption: true,
        }),
    serviceAction(async (spinner, _, { port: userPort, entry }) => {
      spinner.start("Starting Eventual Dev Server");
      const app = express();

      // does not currently load source locations, loadServiceForInfer was failing
      await loadService(entry);

      const serviceSpec = inferLoadedService();

      console.log(JSON.stringify(serviceSpec));

      const port =
        userPort ?? (await getPort({ port: portNumbers(3000, 4000) }));
      app.listen(port);
      const url = `http://localhost:${port}`;

      const localServiceClient = new HttpEventualClient({ serviceUrl: url });

      loadSystemCommands(serviceSpec, localServiceClient);

      const commandWorker = createCommandWorker({
        serviceClient: localServiceClient,
      });

      app.use(express.json());

      app.all("/*", async (req, res) => {
        const resp = await commandWorker(
          new HttpRequest(`${url}${req.originalUrl}`, {
            method: req.method as HttpMethod,
            body: JSON.stringify(req.body),
            headers: req.headers as Record<string, string>,
          })
        );
        // TODO: remove me
        console.debug(req.url);
        console.debug(resp.body);
        res.send(resp.body);
        res.status(resp.status);
        if (resp.statusText) {
          res.statusMessage = resp.statusText;
        }
        resp.headers.forEach((value, name) => res.setHeader(name, value));
      });

      spinner.succeed(`Eventual Dev Server running on ${url}`);
    })
  );

function loadSystemCommands(
  serviceSpec: ServiceSpec,
  serviceClient: EventualServiceClient
) {
  const subscriptionWorker = createSubscriptionWorker({
    subscriptionProvider: new GlobalSubscriptionProvider(),
    serviceClient,
  });
  createListWorkflowsCommand({
    workflowProvider: new ServiceSpecWorkflowProvider(serviceSpec),
  });
  createPublishEventsCommand({
    eventClient: new LocalEventClient(subscriptionWorker),
  });
}
