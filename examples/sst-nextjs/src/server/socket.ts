import { socket } from "@eventual/core";

// expose a websocket endpoint for
export const tickTockFeed = socket("tickTockFeed", {
  $connect: () => {},
  $disconnect: () => {},
  $default: () => {},
});
