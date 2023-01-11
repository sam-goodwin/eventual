import "@eventual/entry/injected";

import { PublishEventsRequest } from "@eventual/core";
import { withErrorMiddleware } from "./middleware.js";
import { createEventClient } from "../../clients/create.js";

const eventClient = createEventClient();

export const handler = withErrorMiddleware(async (request) => {
  const body = request.body;
  if (!body) {
    return { statusCode: 400, body: "Expected publish events to have a body." };
  }
  const eventsRequest = JSON.parse(body) as PublishEventsRequest;

  return eventClient.publishEvents(...eventsRequest.events);
});
