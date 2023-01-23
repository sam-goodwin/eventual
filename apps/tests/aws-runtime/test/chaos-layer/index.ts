#!/usr/bin/env node
import { register, next, EventType } from "./extensions-api.js";
import { HandlerExecutionContext, Pluggable } from "@aws-sdk/types";
import { SSMChaosClient } from "./chaos-client.js";
import { ChaosEngine, ChaosTestConfig } from "./chaos-engine.js";

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

let testingConfig: undefined | ChaosTestConfig;
const chaosEngine = new ChaosEngine(() => testingConfig);

(async function main() {
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  console.log("hello from extension");

  console.log("register");
  const extensionId = await register();
  console.log("extensionId", extensionId);

  const chaosClient = new SSMChaosClient(paramName);

  // execute extensions logic

  while (true) {
    console.log("next");
    const event = await next(extensionId);
    // once per invoke, get new config
    testingConfig = await chaosClient.getConfiguration();
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
})();

export default {
  applyToStack(stack) {
    stack.add(
      (next, context) => {
        return async (args) => {
          if (isCommandContext(context)) {
            if (
              chaosEngine.rejectOperation(
                context.clientName,
                context.commandName
              )
            ) {
              throw new Error("Rejected");
            }
          }
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

interface CommandContext extends HandlerExecutionContext {
  clientName: string;
  commandName: string;
}

function isCommandContext(
  context: HandlerExecutionContext
): context is CommandContext {
  return "clientName" in context && "commandName" in context;
}
