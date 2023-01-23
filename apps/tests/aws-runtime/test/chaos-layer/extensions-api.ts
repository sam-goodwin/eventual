import fetch from "node-fetch";
import path from "path";
// import url from "url";

export enum EventType {
  INVOKE = "INVOKE",
  SHUTDOWN = "SHUTDOWN",
}

// const __dirname = path.dirname(url.fileURLToPat h(import.meta.url));
const baseUrl = `http://${process.env.AWS_LAMBDA_RUNTIME_API}/2020-01-01/extension`;

export async function register(): Promise<string> {
  const res = await fetch(`${baseUrl}/register`, {
    method: "post",
    body: JSON.stringify({
      events: [
        "INVOKE",
        // "SHUTDOWN"
      ],
    }),
    headers: {
      "Content-Type": "application/json",
      "Lambda-Extension-Name": path.basename(__dirname),
    },
  });

  if (!res.ok) {
    console.error("register failed", await res.text());
  }

  return res.headers.get("lambda-extension-identifier") as string;
}

export interface NextEvent {
  eventType: EventType;
}

export async function next(extensionId: string): Promise<NextEvent | null> {
  const res = await fetch(`${baseUrl}/event/next`, {
    method: "get",
    headers: {
      "Content-Type": "application/json",
      "Lambda-Extension-Identifier": extensionId,
    },
  });

  if (!res.ok) {
    console.error("next failed", await res.text());
    return null;
  }

  return (await res.json()) as NextEvent;
}
