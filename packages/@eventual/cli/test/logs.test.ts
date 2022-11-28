import {
  FunctionLogEvents,
  FunctionLogInput,
  getFollowingFunctionLogInputs,
  getInterleavedLogEvents,
  LogEvent,
} from "../src/commands/logs";

test("interleaves logs with mixed ordering in ascending order", () => {
  const functionEvents: FunctionLogEvents[] = [
    {
      fn: {
        friendlyName: "fn1",
        functionName: "fn1fn111",
        startTime: 0,
      },
      events: [
        { timestamp: 0, message: "fn 1 event 1" },
        { timestamp: 2, message: "fn 1 event 2" },
      ],
    },

    {
      fn: {
        friendlyName: "fn2",
        functionName: "fn2fn222",
        startTime: 0,
      },
      events: [
        { timestamp: 1, message: "fn 2 event 1" },
        { timestamp: 3, message: "fn 2 event 2" },
      ],
    },
  ];
  expect(getInterleavedLogEvents(functionEvents)).toMatchObject<LogEvent[]>([
    { ev: { timestamp: 0, message: "fn 1 event 1" }, source: "fn1" },
    { ev: { timestamp: 1, message: "fn 2 event 1" }, source: "fn2" },
    { ev: { timestamp: 2, message: "fn 1 event 2" }, source: "fn1" },
    { ev: { timestamp: 3, message: "fn 2 event 2" }, source: "fn2" },
  ]);
});

test("logs without timestamp are sorted to top", () => {
  const functionEvents: FunctionLogEvents[] = [
    {
      fn: {
        friendlyName: "fn1",
        functionName: "fn1fn111",
        startTime: 0,
      },
      events: [
        { timestamp: 0, message: "fn 1 event 1" },
        { message: "fn 1 event 2" },
      ],
    },

    {
      fn: {
        friendlyName: "fn2",
        functionName: "fn2fn222",
        startTime: 0,
      },
      events: [
        { timestamp: 1, message: "fn 2 event 1" },
        { message: "fn 2 event 2" },
      ],
    },
  ];
  expect(getInterleavedLogEvents(functionEvents)).toMatchObject<LogEvent[]>([
    { ev: { message: "fn 1 event 2" }, source: "fn1" },
    { ev: { message: "fn 2 event 2" }, source: "fn2" },
    { ev: { timestamp: 0, message: "fn 1 event 1" }, source: "fn1" },
    { ev: { timestamp: 1, message: "fn 2 event 1" }, source: "fn2" },
  ]);
});

test("following log inputs have timestamp incremented by 1 of the latest event when there is no next token", () => {
  const functionEvents: FunctionLogEvents[] = [
    {
      fn: {
        friendlyName: "fn1",
        functionName: "fn1fYn111",
        startTime: 0,
      },
      events: [
        { timestamp: 0, message: "fn 1 event 1" },
        { timestamp: 2, message: "fn 1 event 2" },
      ],
    },
    {
      fn: {
        friendlyName: "fn2",
        functionName: "fn2fn222",
        startTime: 0,
      },
      events: [
        { timestamp: 1, message: "fn 2 event 1" },
        { timestamp: 3, message: "fn 2 event 2" },
      ],
    },
  ];
  expect(getFollowingFunctionLogInputs(functionEvents, true)).toMatchObject<
    FunctionLogInput[]
  >([
    { friendlyName: "fn1", functionName: "fn1fYn111", startTime: 3 },
    { friendlyName: "fn2", functionName: "fn2fn222", startTime: 4 },
  ]);
});

test("following log inputs provide next token and still increment start time when next token is provided", () => {
  const functionEvents: FunctionLogEvents[] = [
    {
      fn: {
        friendlyName: "fn1",
        functionName: "fn1fYn111",
        startTime: 0,
        nextToken: "next_123",
      },
      events: [
        { timestamp: 0, message: "fn 1 event 1" },
        { timestamp: 2, message: "fn 1 event 2" },
      ],
      nextToken: "next_456",
    },
    {
      fn: {
        friendlyName: "fn2",
        functionName: "fn2fn222",
        startTime: 0,
        nextToken: "next_456",
      },
      events: [
        { timestamp: 1, message: "fn 2 event 1" },
        { timestamp: 3, message: "fn 2 event 2" },
      ],
      nextToken: "next_789",
    },
  ];
  expect(getFollowingFunctionLogInputs(functionEvents, true)).toMatchObject<
    FunctionLogInput[]
  >([
    {
      friendlyName: "fn1",
      functionName: "fn1fYn111",
      startTime: 3,
      nextToken: "next_456",
    },
    {
      friendlyName: "fn2",
      functionName: "fn2fn222",
      startTime: 4,
      nextToken: "next_789",
    },
  ]);
});

test("following log inputs don't emit next token when it is the same as input token", () => {
  const functionEvents: FunctionLogEvents[] = [
    {
      fn: {
        friendlyName: "fn1",
        functionName: "fn1fYn111",
        startTime: 0,
        nextToken: "next_123",
      },
      events: [
        { timestamp: 0, message: "fn 1 event 1" },
        { timestamp: 2, message: "fn 1 event 2" },
      ],
      nextToken: "next_123",
    },
    {
      fn: {
        friendlyName: "fn2",
        functionName: "fn2fn222",
        startTime: 0,
        nextToken: "next_456",
      },
      events: [
        { timestamp: 1, message: "fn 2 event 1" },
        { timestamp: 3, message: "fn 2 event 2" },
      ],
      nextToken: "next_456",
    },
  ];
  expect(getFollowingFunctionLogInputs(functionEvents, true)).toMatchObject<
    FunctionLogInput[]
  >([
    {
      friendlyName: "fn1",
      functionName: "fn1fYn111",
      startTime: 3,
    },
    {
      friendlyName: "fn2",
      functionName: "fn2fn222",
      startTime: 4,
    },
  ]);
});

test("following log inputs don't emit next token when it is is not in the output parameter", () => {
  const functionEvents: FunctionLogEvents[] = [
    {
      fn: {
        friendlyName: "fn1",
        functionName: "fn1fYn111",
        startTime: 0,
        nextToken: "next_123",
      },
      events: [
        { timestamp: 0, message: "fn 1 event 1" },
        { timestamp: 2, message: "fn 1 event 2" },
      ],
    },
    {
      fn: {
        friendlyName: "fn2",
        functionName: "fn2fn222",
        startTime: 0,
        nextToken: "next_456",
      },
      events: [
        { timestamp: 1, message: "fn 2 event 1" },
        { timestamp: 3, message: "fn 2 event 2" },
      ],
    },
  ];
  expect(getFollowingFunctionLogInputs(functionEvents, true)).toMatchObject<
    FunctionLogInput[]
  >([
    {
      friendlyName: "fn1",
      functionName: "fn1fYn111",
      startTime: 3,
    },
    {
      friendlyName: "fn2",
      functionName: "fn2fn222",
      startTime: 4,
    },
  ]);
});
