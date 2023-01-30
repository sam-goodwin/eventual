import { SSMClient } from "@aws-sdk/client-ssm";
import { SSMChaosClient } from "./chaos-client.js";
import { ChaosTestConfig, ChaosEngine } from "./chaos-engine.js";
import { register, next, EventType } from "./extensions-api.js";

const paramName = process.env.EVENTUAL_CHAOS_TEST_PARAM ?? "";

if (!paramName) {
  throw new Error("Expected EVENTUAL_CHAOS_TEST_PARAM to be a JSON object.");
}

function handleShutdown(event: any) {
  console.log("shutdown", { event });
  process.exit(0);
}

let testingConfig: undefined | ChaosTestConfig;
export const chaosEngine = new ChaosEngine(() => testingConfig);
const ssm = new SSMClient({});

/**
 * An internal lambda extension which maintains the Chaos Engine SSM Parameter during execution.
 *
 * It is started using chaos-ext in aws-runtime-cdk which `--require`s this bundle on lambda node start.
 */

(async function main() {
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  console.debug("Starting Chaos Test Configuration Extension");

  console.debug("[Chaos Test Configuration Extension]", "register");
  const extensionId = await register();
  console.debug(
    "[Chaos Test Configuration Extension]",
    "extensionId",
    extensionId
  );

  const chaosClient = new SSMChaosClient(paramName, ssm);

  // execute extensions logic

  while (true) {
    console.log("next");
    const event = await next(extensionId);
    if (!event) {
      continue;
    }
    switch (event.eventType) {
      case EventType.INVOKE:
        // once per invoke, get new config
        testingConfig = await chaosClient.getConfiguration();
        break;
      default:
        throw new Error("unknown event: " + event.eventType);
    }
  }
})();
