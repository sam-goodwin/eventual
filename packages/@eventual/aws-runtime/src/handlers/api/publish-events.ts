import "@eventual/injected/entry";

import { PublishEventsRequest } from "@eventual/core";
import { createEventClient } from "../../create.js";
import { withErrorMiddleware } from "./middleware.js";

const eventClient = createEventClient();

export const handler = withErrorMiddleware(async (request) => {
  const body = request.body;
  if (!body) {
    return { statusCode: 400, body: "Expected publish events to have a body." };
  }
  const eventsRequest = JSON.parse(body) as PublishEventsRequest;

  return eventClient.publishEvents(...eventsRequest.events);
});
