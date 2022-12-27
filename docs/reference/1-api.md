# API

Each [Service](./0-service.md) has its own API Gateway that you can register routes onto using the `api` object available in `@eventual/core`.

```ts
import { api } from "@eventual/core";
```

## Router

The default router provided by Eventual is built with [`itty-router`](https://github.com/kwhitley/itty-router) and uses the Node [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)'s [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) and [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) types.

Your `tsconfig.json` must contain the DOM lib or else the `Request` and `Response` types will not be available.

```json
{
  "compilerOptions": {
    "lib": ["DOM"]
  }
}
```

You may also need to polyfill with [`node-fetch`](https://www.npmjs.com/package/node-fetch).

## Routes and Handlers

All [Http Methods](#http-methods) follow the same pattern of taking in a string representing the route and a handler function that accepts a Request and returns a `Promise<Response>`.

```ts
api.post("/echo", async (request) => {
  return new Response(await request.text());
});
```

## Path Parameters

Path parameters are registered in routes using the syntax `:paramName` and are available as the `Request.params` property.

```ts
api.get("/hello/:name", async (request) => {
  return new Response(`hello ${request.params.name}`);
});
```

## Headers

Any HTTP headers are available on the `headers` property:

```ts
api.get("/hello/:name", async (request) => {
  if (request.headers.get("Content-Type"))
    return new Response(`hello ${request.params.name}`);
  }
});
```

## Order of precedence

Routes are evaluated in the order in which they are registered and the first route that matches will be evaluated.

## Http Methods

### `all`

Registers a route that will match any HTTP method (GET, POST, etc.).

```ts
api.all("/hello", (request) => { .. });
```

### `get`

Registers a route that only matches a GET HTTP method.

```ts
api.get("/hello", (request) => { .. });
```

### `post`

Registers a route that only matches a POST HTTP method.

```ts
api.post("/hello", (request) => { .. });
```

### `put`

Registers a route that only matches a PUT HTTP method.

```ts
api.put("/hello", (request) => { .. });
```

### `delete`

Registers a route that only matches a DELETE HTTP method.

```ts
api.delete("/hello", (request) => { .. });
```

### `options`

Registers a route that only matches an OPTIONS HTTP method.

```ts
api.options("/hello", (request) => { .. });
```

### `patch`

Registers a route that only matches a PATCH HTTP method.

```ts
api.patch("/hello", (request) => { .. });
```
