import { FetchRequestHandler } from "./fetch-request-handler.js";
import { NodeRequestHandler } from "./node-request-handler.js";
import { RequestHandler } from "./request-handler.js";

/**
 * Retrieves either the {@link FetchRequestHandler or NodeRequestHandler} based on
 * whether fetch is available in the system.  
 */
export function getRequestHandler(): RequestHandler {
  if (!!globalThis.fetch) {
    return new FetchRequestHandler();
  }
  return new NodeRequestHandler();
}
