import { api } from "@eventual/core";
import * as e from "@eventual/core";

export const myHandler = api.get("/", async () => {
  return new Response();
});

export const myHandler2 = e.api.get("/", async () => {
  return new Response();
});
