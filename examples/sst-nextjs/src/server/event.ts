import { event } from "@eventual/core";

export const tick = event<{
  time: number;
}>("tick");

export const tock = event<{
  time: number;
}>("tock");

export const onTock = tock.onEvent("onTock", async (event) => {});
