import itty from "itty-router";

const hooks: Hook[] = [];

export type Hook = (
  router: itty.Router<itty.Request, itty.IHTTPMethods>
) => void;

export function hook(setup: Hook) {
  hooks.push(setup);
}

export function getHooks() {
  return [...hooks];
}
