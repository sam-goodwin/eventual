const requestFn = jest.fn();
jest.unstable_mockModule("https", () => ({
  // @ts-ignore
  // ...jest.requireActual("https"), // import and retain the original functionalities
  __esModule: true, // this property makes it work
  request: requestFn,
  on: jest.fn(),
  write: jest.fn(),
  end: jest.fn(),
}));

import { jest } from "@jest/globals";
import { ClientRequest, IncomingMessage } from "http";
import { Stream } from "stream";

import { ApiRequest } from "@eventual/core";
import { NodeRequestHandler } from "../src/request-handler/node-request-handler.js";
import { HttpError } from "../src/request-handler/request-handler.js";

const handler = new NodeRequestHandler();

const apiResponseBody = { value: "hi" };

beforeEach(() => {
  jest.resetAllMocks();
});

test("returns json", async () => {
  requestFn.mockImplementation(createRequest(apiResponseBody, 200));
  const result = await handler.request(
    new ApiRequest("https://hello.com", { method: "get" })
  );
  expect(result).toEqual(apiResponseBody);
});

test("throws on error", async () => {
  requestFn.mockImplementation(createRequest("something went wrong", 400));
  expect(() =>
    handler.request(new ApiRequest("https://hello.com", { method: "get" }))
  ).rejects.toThrow(new HttpError(400, JSON.stringify("something went wrong")));
});

function createRequest(
  data: any,
  statusCode: number = 200,
  statusMessage: string = "API Success"
) {
  return (...args: any[]) => {
    const [, , cb] =
      args.length === 2 ? [null, null, args[1]] : [null, null, args[2]];
    const stream = new Stream.Readable() as IncomingMessage;
    stream.statusCode = statusCode;
    stream.statusMessage = statusMessage;
    cb(stream);
    stream.push(JSON.stringify(data));
    stream.push(null);
    return {
      on: jest.fn() as ClientRequest["on"],
      end: jest.fn() as ClientRequest["end"],
    } as ClientRequest;
  };
}
