import z from "zod";
import { Infer, UnexpectedVersion, entity, socket } from "@eventual/core";

export type Connection = Infer<typeof connections>;

const connections = entity("connections", {
  partition: ["connectionId"],
  attributes: {
    channelId: z.string(),
    connectionId: z.string(),
  },
});

const channels = connections.index("channels", {
  partition: ["channelId"],
  sort: ["connectionId"],
});

// expose a websocket endpoint for
export const tickTockFeed = socket("tickTockFeed", {
  $connect: async ({ query, connectionId }) => {
    if (typeof query?.channelId !== "string") {
      throw new Error("channelId is required");
    }
    const channelId = query.channelId;

    try {
      await connections.put(
        {
          channelId,
          connectionId,
        },
        {
          expectedVersion: 0,
        }
      );
    } catch (err) {
      if (err instanceof UnexpectedVersion) {
        console.warn(`connection ${connectionId} already exists`);
      } else {
        throw err;
      }
    }
  },
  $disconnect: async ({ connectionId }) => {
    await connections.delete({
      connectionId,
    });
  },
  $default: async ({ connectionId, body }) => {
    const messageStr = Buffer.isBuffer(body) ? body.toString("utf-8") : body;
    const message =
      typeof messageStr === "string" ? JSON.parse(messageStr) : undefined;
    if (message !== undefined) {
      const channelId = message.channelId;
      if (typeof channelId !== "string") {
        throw new Error(
          "Invalid message format: 'channelId' field must be a string."
        );
      }
      if (!message.body) {
        throw new Error(
          "Invalid message format: 'body' field must be present."
        );
      }

      // const connection = await connections.get({
      //   connectionId,
      // });

      const subscribers = await getSubscribers(channelId);

      await Promise.allSettled(
        subscribers.map((subscriber) => {
          tickTockFeed.send(
            subscriber.connectionId,
            JSON.stringify(message.body ?? null)
          );
        })
      );
    }
  },
});

async function getSubscribers(
  channelId: string,
  continuationToken?: string
): Promise<Connection[]> {
  const { entries: subscriberEntries = [], nextToken } = await channels.query(
    {
      channelId,
    },
    {
      nextToken: continuationToken,
    }
  );
  const subscribers = subscriberEntries?.map((s) => s.value);
  if (nextToken) {
    return [...subscribers, ...(await getSubscribers(channelId, nextToken))];
  } else {
    return subscribers;
  }
}
