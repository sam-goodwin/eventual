import { APIGatewayProxyEventV2 } from "aws-lambda";
import { workflows } from "../env";

export async function handler(_event: APIGatewayProxyEventV2) {
  return Object.fromEntries(
    Object.entries(workflows).map(([name, _workflow]) => [
      name,
      { status: "not implemeneted" },
    ])
  );
}
