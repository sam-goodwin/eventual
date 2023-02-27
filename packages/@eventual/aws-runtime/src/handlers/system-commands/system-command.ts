import type { AnyCommand } from "@eventual/core";
import { createCommandWorker } from "@eventual/core-runtime";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createApiGCommandAdaptor } from "../apig-command-adapter.js";

export function systemCommandWorker(
  _command: AnyCommand
): APIGatewayProxyHandlerV2<Response> {
  return createApiGCommandAdaptor({
    commandWorker: createCommandWorker({}),
  });
}
