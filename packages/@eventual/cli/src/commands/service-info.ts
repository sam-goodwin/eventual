import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const serviceInfo = (yargs: Argv) =>
  yargs.command(
    "service [service]",
    "Get data about your service",
    (yargs) =>
      setServiceOptions(yargs, true).option("service", {
        type: "string",
        description: "Name of service to operate on",
      }),
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
        process.stdout.write("\n");
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
