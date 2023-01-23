#!/usr/bin/env node
import { register, next, EventType } from "./extensions-api.js";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Pluggable } from "@aws-sdk/types";
import Mitm from "mitm";

const ssm = new SSMClient({});
const paramName = process.env.EVENTUAL_CHAOS_TEST_PARAM ?? "";

if (!paramName) {
  throw new Error("Expected EVENTUAL_CHAOS_TEST_PARAM to be a JSON object.");
}

function handleShutdown(event: any) {
  console.log("shutdown", { event });
  process.exit(0);
}

function handleInvoke(event: any) {
  console.log("invoke", { event });
}

(async function main() {
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  console.log("hello from extension");

  console.log("register");
  const extensionId = await register();
  console.log("extensionId", extensionId);

  let testingConfig: undefined | ChaosTestConfigWrapper;

  const mitm = Mitm();
  (mitm as any).enable();

  mitm.on("request", function (request, res) {
    const block = false;
    console.log("request", request);

    if (block) {
      res.statusCode = 500;
      res.end();
    } else {
      // do nothing
    }
  });

  mitm.on("connect", function (_socket, opts) {
    console.log("connection", opts);
    _socket.on("data", (data) => {
      console.log("connection data to: ", opts.host, data.toString("utf-8"));
    });
    _socket.bypass();
  });

  // execute extensions logic

  while (true) {
    console.log("next");
    const event = await next(extensionId);
    // once per invoke, get new config
    await updateChaosConfig();
    if (!event) {
      continue;
    }
    switch (event.eventType) {
      case EventType.SHUTDOWN:
        handleShutdown(event);
        break;
      case EventType.INVOKE:
        handleInvoke(event);
        break;
      default:
        throw new Error("unknown event: " + event.eventType);
    }
  }

  async function updateChaosConfig() {
    const config = await getChaosTestParamValue();
    if (config.version !== testingConfig?.version) {
      testingConfig = config;
      console.debug(
        `Found new chaos config version ${config.version}: ${config.config}`
      );
    }
  }
})();

async function getChaosTestParamValue(): Promise<ChaosTestConfigWrapper> {
  const param = await ssm.send(
    new GetParameterCommand({
      Name: paramName,
    })
  );

  const rawValue = param.Parameter?.Value;
  if (!rawValue) {
    console.log("Chaos testing value not found, testing disabled.");
    return { config: { disabled: true } };
  }

  return {
    version: param.Parameter?.Version,
    config: JSON.parse(rawValue) as ChaosTestConfig,
  };
}

interface ChaosTestConfigWrapper {
  version?: number;
  config: ChaosTestConfig;
}

export interface ChaosTestConfig {
  disabled: boolean;
  rules?: [];
}

export default {
  applyToStack(stack) {
    stack.add(
      (next, context) => {
        return async (args) => {
          console.log("chaos plugin", context, args);
          return next(args);
        };
      },
      {
        step: "initialize",
        name: "chaos_plugin_rejector",
      }
    );
  },
} satisfies Pluggable<any, any>;
