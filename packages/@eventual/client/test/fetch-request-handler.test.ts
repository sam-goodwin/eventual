import { jest } from "@jest/globals";

import { FetchRequestHandler } from "../src/request-handler/fetch-request-handler.js";
import { HttpError } from "../src/request-handler/request-handler.js";

const fetchMock = jest.fn<typeof fetch>();
globalThis.fetch = fetchMock;

const handler = new FetchRequestHandler();

const apiResponseBody = { value: "hi" };

beforeEach(() => {
  jest.resetAllMocks();
});

test("returns json", async () => {
  fetchMock.mockImplementation(createRequest(apiResponseBody, 200));
  const result = await handler.request({
    url: "https://hello.com",
    method: "GET",
  });
  expect(result).toEqual(apiResponseBody);
});

test("throws on error", async () => {
  fetchMock.mockImplementation(createRequest("something went wrong", 400));
  expect(() =>
    handler.request({
      url: "https://hello.com",
      method: "GET",
    })
  ).rejects.toThrow(new HttpError(400, JSON.stringify("something went wrong")));
});

function createRequest(
  data: any,
  statusCode = 200,
  statusMessage = "API Success"
): typeof fetch {
  return async () => {
    return new Response(JSON.stringify(data), {
      status: statusCode,
      statusText: statusMessage,
    });
  };
}
