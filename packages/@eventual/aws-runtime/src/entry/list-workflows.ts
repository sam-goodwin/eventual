import { workflows } from "@eventual/core";
import "@eventual/entry/injected";
import { Handler } from "aws-lambda";
import { withErrorMiddleware } from "../handlers/api/middleware.js";

async function listWorkflows() {
  return workflows().keys;
}

export const handler: Handler = withErrorMiddleware(listWorkflows);
