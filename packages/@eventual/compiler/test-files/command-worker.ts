import { api, HttpResponse } from "@eventual/core";
import * as e from "@eventual/core";

export const myHandler = api.get("/", async () => {
  return new HttpResponse();
});

export const myHandler2 = e.api.get("/", async () => {
  return new e.HttpResponse();
});
