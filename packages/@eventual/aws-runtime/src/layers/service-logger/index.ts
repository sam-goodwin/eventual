import { next, register } from "./extensions-api.js";
import { subscribe } from "./telemetry-api.js";
import { eventsQueue, start } from "./listener.js";
import { dispatch } from "./logs-dispatcher.js";

(async function main() {
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  console.log("[index:main] Starting the Telemetry API extension");

  // Step 1 - Register the extension with Extensions API
  console.log("[index:main] Registering extension");
  const extensionId = await register();
  console.log("[index:main] Registered with extensionId", extensionId);

  // Step 2 - Start the local http listener which will receive data from Telemetry API
  console.log("[index:main] Starting the telemetry listener");
  const listenerUri = start();
  console.log("[index:main] Telemetry listener started at", listenerUri);

  // Step 3 - Subscribe the listener to Telemetry API
  console.log(
    "[index:main] Subscribing the telemetry listener to Telemetry API"
  );
  await subscribe(extensionId, listenerUri);
  console.log("[index:main] Subscription success");

  while (true) {
    console.log("[index:main] Next");

    // This is a blocking action
    const event = await next(extensionId);

    switch (event.eventType) {
      case "INVOKE":
        handleInvoke(event);
        await dispatch(eventsQueue);
        break;
      case "SHUTDOWN":
        // Wait for 1 sec to receive remaining events
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });

        // Dispatch queued telemetry prior to handling the shutdown event
        await dispatch(eventsQueue);
        handleShutdown(event);
        break;
      default:
        throw new Error("[index:main] unknown event: " + event);
    }
  }
})();

function handleShutdown(_event: string) {
  console.log("[index:handleShutdown]");
  process.exit(0);
}

function handleInvoke(_event: string) {
  console.log("[index:handleInvoke]");
}
