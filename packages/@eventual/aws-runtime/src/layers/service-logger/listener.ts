import { iterator } from "@eventual/core";
import express, { Request } from "express";

const LISTENER_HOST = "sandbox.localdomain";
const LISTENER_PORT = 4243;
const _eventsQueue: TelemetryRequest[] = [];
export const eventsQueue = iterator(_eventsQueue);

// borrowed from:
// https://github.com/aws-samples/aws-lambda-extensions/blob/main/nodejs-example-telemetry-api-extension/nodejs-example-telemetry-api-extension/telemetry-listener.js

export function start() {
  console.log("[telemetry-listener:start] Starting a listener");
  const server = express();
  server.use(express.json({ limit: "512kb" }));

  // Logging or printing besides handling error cases below is not recommended
  // if you have subscribed to receive extension logs. Otherwise, logging here will
  // cause Telemetry API to send new entries for the printed lines which might create a loop
  server.post("/", (req: Request<any, any, TelemetryRequest[]>, res) => {
    if (req.body.length && req.body.length > 0) {
      _eventsQueue.push(...req.body);
    }
    console.log(
      "[telemetry-listener:post] received",
      req.body.length,
      "total",
      _eventsQueue.length
    );
    res.send("OK");
  });

  const listenerUrl = `http://${LISTENER_HOST}:${LISTENER_PORT}`;
  server.listen(LISTENER_PORT, LISTENER_HOST, () => {
    console.log(`[telemetry-listener:start] listening at ${listenerUrl}`);
  });
  return listenerUrl;
}

interface TelemetryRequest {
  // ISO8601 UTC
  time: string;
  type: string;
  record: object;
}
