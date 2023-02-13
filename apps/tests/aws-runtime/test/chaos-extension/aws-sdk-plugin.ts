import { HandlerExecutionContext, Pluggable } from "@aws-sdk/types";
import { ChaosEngine } from "./chaos-engine.js";

/**
 * Creates a plugin that modifies the behavior of any Aws SDK client based on the
 * given {@link ChaosTestConfig}.
 *
 * ```ts
 * const s3 = new S3Client({});
 * s3.middlewareStack.use(createAwsSDKChaosPlugin(chaosEngine));
 * ```
 */
export function createAwsSDKChaosPlugin(
  chaosEngine: ChaosEngine
): Pluggable<any, any> {
  return {
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
  };
}

interface CommandContext extends HandlerExecutionContext {
  clientName: string;
  commandName: string;
}

function isCommandContext(
  context: HandlerExecutionContext
): context is CommandContext {
  return "clientName" in context && "commandName" in context;
}
