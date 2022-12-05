import { workflows } from "@eventual/core";
import "@eventual/entry/injected";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { withErrorMiddleware } from "../handlers/api/middleware.js";

async function listWorkflows() {
  return Array.from(workflows().keys());
}

export const handler: APIGatewayProxyHandlerV2<string[]> =
  withErrorMiddleware(listWorkflows);
