import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const serviceInfo = (yargs: Argv) =>
  yargs.command(
    "info",
    "Get data about your service",
    (yargs) => setServiceOptions(yargs, true),
    serviceAction(
      async (spinner, _service, _, serviceData) => {
        spinner.start("Getting executions");
        spinner.stop();
        process.stdout.write(
          [
            `API Gateway: ${serviceData.apiEndpoint}`,
            `Event Bus Arn: ${serviceData.eventBusArn}`,
          ].join("\n")
        );
      },
      async (_service, _, serviceData) => {
        process.stdout.write(
          JSON.stringify({
            apiEndpoint: serviceData.apiEndpoint,
            eventBusArn: serviceData.eventBusArn,
          }) + "\n"
        );
      }
    )
  );
