import type http from "@tshttp/status";

export type HttpStatus = typeof http.Status[keyof typeof http.Status];
