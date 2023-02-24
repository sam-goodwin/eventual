import {
  Command,
  CommandHandler,
  CommandInput,
  CommandOutput,
} from "@eventual/core";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
} from "aws-lambda/trigger/api-gateway-proxy.js";
import { z } from "zod";
import { withErrorMiddleware } from "./middleware.js";

interface SystemCommandOptions<ZRequest extends z.Schema> {
  /**
   * When provided, validates the input using zod.
   */
  inputSchema: ZRequest;
}

export function systemCommand<C extends Command>(
  opts: SystemCommandOptions<z.Schema<CommandInput<C>>>,
  handler: CommandHandler<CommandInput<C>, CommandOutput<C>>
): APIGatewayProxyHandlerV2<Response>;
export function systemCommand<C extends Command>(
  handler: CommandHandler<CommandInput<C>, CommandOutput<C>>
): APIGatewayProxyHandlerV2<Response>;
export function systemCommand<C extends Command>(
  ...args:
    | [handler: CommandHandler<CommandInput<C>, CommandOutput<C>>]
    | [
        opts: SystemCommandOptions<any>,
        handler: CommandHandler<CommandInput<C>, CommandOutput<C>>
      ]
): APIGatewayProxyHandlerV2<Response> {
  const [opts, handler] = args.length === 1 ? [undefined, args[0]] : args;
  return withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const payload = event.body ? JSON.parse(event.body) : undefined;

    return handler(
      opts?.inputSchema ? opts?.inputSchema.parse(payload) : payload,
      undefined
    );
  });
}
