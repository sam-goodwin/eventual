import { event } from "@eventual/core";

export const tick = event<{
  time: number;
}>("tick");

export const tock = event<{
  time: number;
}>("tick");
