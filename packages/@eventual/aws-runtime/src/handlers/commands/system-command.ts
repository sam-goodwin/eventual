import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
} from "aws-lambda/trigger/api-gateway-proxy.js";
import { z } from "zod";
import { withErrorMiddleware } from "./middleware.js";

interface SystemCommandOptions<Request> {
  input: z.Schema<Request>;
}

export function systemCommand<Request, Response>(
  opts: SystemCommandOptions<Request>,
  handler: (request: Request) => Response | Promise<Response>
): APIGatewayProxyHandlerV2<Response>;
export function systemCommand<Request, Response>(
  handler: (request: Request) => Response | Promise<Response>
): APIGatewayProxyHandlerV2<Response>;
export function systemCommand<Request, Response>(
  ...args:
    | [handler: (request: Request) => Promise<Response>]
    | [
        opts: SystemCommandOptions<Request>,
        handler: (request: Request) => Promise<Response>
      ]
): APIGatewayProxyHandlerV2<Response> {
  const [opts, handler] = args.length === 1 ? [undefined, args[0]] : args;
  return withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const payload = event.body ? JSON.parse(event.body) : undefined;

    return handler(opts?.input ? opts?.input.parse(payload) : payload);
  });
}
