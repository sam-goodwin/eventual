import type http from "@tshttp/status";

export type HttpStatusCode = typeof http.Status[keyof typeof http.Status];

export type SuccessHttpStatusCode =
  typeof http.SuccessStatus[keyof typeof http.SuccessStatus];
