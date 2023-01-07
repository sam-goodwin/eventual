import "../../handlers/fetch-polyfill.js";

const baseUrl = `http://${process.env.AWS_LAMBDA_RUNTIME_API}/2020-01-01/extension`;

export async function register() {
  console.info("[extensions-api:register] Registering using baseUrl", baseUrl);
  const res = await fetch(`${baseUrl}/register`, {
    method: "post",
    body: JSON.stringify({
      events: ["INVOKE", "SHUTDOWN"],
    }),
    headers: {
      "Content-Type": "application/json",
      // The extension name must match the file name of the extension itself that's in /opt/extensions/
      "Lambda-Extension-Name": "service-logger",
    },
  });

  if (!res.ok) {
    console.error(
      "[extensions-api:register] Registration failed:",
      await res.text()
    );
    throw new Error(
      "[extensions-api:register] something went wrong: expected to receive extensionId"
    );
  } else {
    const extensionId = res.headers.get("lambda-extension-identifier");
    if (!extensionId) {
      console.error(
        "[extensions-api:register] something went wrong: expected to receive extensionId"
      );
      throw new Error(
        "[extensions-api:register] something went wrong: expected to receive extensionId"
      );
    }
    console.info(
      "[extensions-api:register] Registration success with extensionId",
      extensionId
    );
    return extensionId;
  }
}

export async function next(extensionId: string) {
  console.info("[extensions-api:next] Waiting for next event");
  const res = await fetch(`${baseUrl}/event/next`, {
    method: "get",
    headers: {
      "Content-Type": "application/json",
      "Lambda-Extension-Identifier": extensionId,
    },
  });

  if (!res.ok) {
    console.error(
      "[extensions-api:next] Failed receiving next event",
      await res.text()
    );
    return null;
  } else {
    const event = await res.json();
    console.info("[extensions-api:next] Next event received");
    return event;
  }
}
