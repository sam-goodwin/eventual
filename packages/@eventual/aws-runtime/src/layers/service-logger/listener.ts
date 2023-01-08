import { iterator } from "@eventual/core";
import express, { Request } from "express";
import { dispatch } from "./logs-dispatcher.js";

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
  server.post("/", async (req: Request<any, any, TelemetryRequest[]>, res) => {
    const events = req.body;
    const functionEvents = req.body.length
      ? events.filter((e) => e.type === "function")
      : [];

    if (functionEvents.length > 0) {
      // only add function logs
      _eventsQueue.push(...events.filter((e) => e.type === "function"));
    }

    const queueSize = eventsQueue.size();

    console.log(
      "[telemetry-listener:post] received",
      req.body.length,
      "function events",
      functionEvents.length,
      "queue total",
      queueSize
    );

    const hasRuntimeDone = events.some(
      (e) => e.type === "platform.runtimeDone"
    );

    console.log("[telemetry-listener:post] runtime done", hasRuntimeDone);

    if (hasRuntimeDone || queueSize >= 100) {
      await dispatch(eventsQueue);
    } else if (queueSize > 0) {
      setTimeout(() => {
        const queueSize = eventsQueue.size();
        if (queueSize > 0) {
          console.log("[telemetry-listener:post] timed dispatch", queueSize);
          dispatch(eventsQueue);
        }
      }, 1000);
    }

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
