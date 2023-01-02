---
sidebar_position: 1
---

# REST API

The API for each Eventual service is a REST API that is exposed through an API Gateway. This allows external systems to interact with the service by making HTTP requests to specific endpoints. The API can be used to trigger workflows, complete async activities, and retrieve the results of succeeded workflows. In this documentation, we will explain how to use the api object provided by Eventual to register routes and handle incoming requests.

## Router

To add routes to your service's API Gateway, you can use the api object provided in the `@eventual/core` package.

```ts
import { api } from "@eventual/core";

api.post("/echo", async (request) => {
  return new Response(await request.text());
});
```

## Routes and Handlers

To register a route and handler function, you can use one of the HTTP method functions provided by the `api` object, such as `api.get`, `api.post`, `api.put`, `api.delete`, etc. These functions take in a string representing the route and a handler function that accepts a `Request` object and returns a `Promise<Response>`.

```ts
api.post("/echo", async (request) => {
  return new Response(await request.text());
});
```

### Path Parameters

Path parameters are registered in routes using the syntax `:paramName` and are available as the `Request.params` property.

```ts
api.get("/hello/:name", async (request) => {
  return new Response(`hello ${request.params.name}`);
});
```

### Headers

Any HTTP headers are available on the `headers` property:

```ts
api.get("/hello/:name", async (request) => {
  if (request.headers.get("Content-Type"))
    return new Response(`hello ${request.params.name}`);
  }
});
```

### Supported Intrinsic Functions

The following intrinsic functions can be called within an API handler:

- [`publishEvent`](./event.md#publish-to-an-event)

```ts
await myEvent.publishEvent({ .. });
```

- [`startExecution`](./workflow.md#start-execution)

```ts
await myWorkflow.startExecution({
  input: <input payload>
})
```

- [`sendActivitySuccess`](./activity.md#sendactivitysuccess)

```ts
await myActivity.sendActivitySuccess({
  token: <token>,
  result: <result>
})
```

- [`sendActivityFailure`](./activity.md#sendactivityfailure)

```ts
await myActivity.sendActivityFailure({
  token: <token>,
  error: <error>
})
```

## Order of precedence

Routes are evaluated in the order in which they are registered and the first route that matches will be evaluated.

## Http Methods

In a REST API, HTTP methods are used to specify the type of action being performed on a resource. In Eventual, you can register routes for specific HTTP methods using the following functions:

### `all`

Use `all` to register a route that will match any HTTP method (GET, POST, etc.). This can be useful if you want to handle all requests to a specific route in the same way, regardless of the method being used.

```ts
api.all("/hello", (request) => { .. });
```

### `get`

Use `get` to register a route that only matches a GET HTTP method. This method is typically used to retrieve a resource.

```ts
api.get("/hello", (request) => { .. });
```

### `post`

Use `post` to register a route that only matches a POST HTTP method. This method is typically used to create a new resource.

```ts
api.post("/hello", (request) => { .. });
```

### `put`

Use the `put` method to register a route that only matches a PUT HTTP method. PUT requests are used to send data to a server to create or update a resource. PUT requests are similar to POST requests, but they should replace the existing resource with the new data.

```ts
api.put("/hello", (request) => { .. });
```

### `delete`

Use `delete` to register a route that only matches a DELETE HTTP method. This method is typically used to delete a resource.

```ts
api.delete("/hello", (request) => { .. });
```

### `options`

Use `options` to register a route that only matches an OPTIONS HTTP method. This method is typically used to retrieve information about the options available for a resource.

```ts
api.options("/hello", (request) => { .. });
```

### `patch`

The `patch` method registers a route that only matches a PATCH HTTP method. It is used to apply partial modifications to a resource.

```ts
api.patch("/hello", (request) => { .. });
```

## Node Fetch API

The default router provided by Eventual is built with [`itty-router`](https://github.com/kwhitley/itty-router) and uses the Node [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)'s [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) and [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) types.

Your `tsconfig.json` must contain the DOM lib or else the `Request` and `Response` types will not be available.

```json
{
  "compilerOptions": {
    "lib": ["DOM"]
  }
}
```

Unless you're using Node 18+, you will need to polyfill with [`node-fetch`](https://www.npmjs.com/package/node-fetch).
