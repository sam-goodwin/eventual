import middy from "@middy/core";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { workflows } from "../env";
import { errorMiddleware } from "../middleware";

async function list(_event: APIGatewayProxyEventV2) {
  return Object.keys(workflows);
}

export const handler = middy(list).use(errorMiddleware);
