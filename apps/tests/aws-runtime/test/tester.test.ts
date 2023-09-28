import { ServiceClient } from "@eventual/client";
import {
  commandRpcPath,
  EventualError,
  HeartbeatTimeout,
  ServiceContext,
} from "@eventual/core";
import { jest } from "@jest/globals";
import { WebSocket } from "ws";
import { ChaosEffects, ChaosTargets } from "./chaos-extension/chaos-engine.js";
import { serviceUrl, testSocketUrl } from "./env.js";
import { eventualRuntimeTestHarness } from "./runtime-test-harness.js";
import type * as TestService from "./test-service.js";
import {
  allCommands,
  asyncWorkflow,
  bucketWorkflow,
  createAndDestroyWorkflow,
  DataSocketEvent,
  entityWorkflow,
  eventDrivenWorkflow,
  failedWorkflow,
  heartbeatWorkflow,
  parentWorkflow,
  queueWorkflow,
  SocketMessage,
  StartSocketEvent,
  timedOutWorkflow,
  timedWorkflow,
  transactionWorkflow,
  workflow1,
  workflow2,
  workflow3,
  workflow4,
} from "./test-service.js";

jest.setTimeout(200 * 1000);

eventualRuntimeTestHarness(
  ({ testCompletion, testFailed }) => {
    testCompletion(
      "call task",
      workflow1,
      { name: "sam" },
      `you said hello sam I am hello2 and you were invoked by my-workflow`
    );

    testCompletion(
      "call workflow",
      workflow2,
      "user: you said hello sam I am hello2 and you were invoked by my-workflow"
    );

    testCompletion("sleep", workflow3, "done!");

    testCompletion("parallel", workflow4, [
      { status: "fulfilled", value: ["hello sam", "hello chris", "hello sam"] },
      { status: "fulfilled", value: ["HELLO SAM", "HELLO CHRIS", "HELLO SAM"] },
      { status: "fulfilled", value: ["hello sam", "hello chris", "hello sam"] },
      { status: "fulfilled", value: "hello sam" },
      {
        status: "rejected",
        reason: new EventualError("Error", "failed").toJSON(),
      },
    ]);

    testCompletion("parent-child", parentWorkflow, "done");

    testCompletion("timeouts", timedOutWorkflow, {
      condition: true,
      signal: true,
      task: true,
      workflow: true,
      taskFailImmediately: true,
      taskOnInvoke: true,
      workflowOnInvoke: true,
    });

    // TODO: support remote calls on local
    if (!process.env.TEST_LOCAL) {
      testCompletion("asyncTasks", asyncWorkflow, [
        "hello from the async writer!",
        new EventualError(
          "AsyncWriterError",
          "I was told to fail this task, sorry."
        ).toJSON(),
      ]);
    }

    testCompletion("heartbeat", heartbeatWorkflow, 20, [
      { status: "fulfilled", value: 20 },
      {
        status: "rejected",
        reason: new HeartbeatTimeout("Task Heartbeat TimedOut").toJSON(),
      },
      { status: "fulfilled", value: "task did not respond" },
      {
        status: "rejected",
        reason: new HeartbeatTimeout("Task Heartbeat TimedOut").toJSON(),
      },
    ]);

    testCompletion("event-driven", eventDrivenWorkflow, "done!");

    testFailed(
      "catch thrown error",
      failedWorkflow,
      true,
      "MyError",
      "I am useless"
    );
    testFailed(
      "catch thrown value",
      failedWorkflow,
      false,
      "Error",
      `"I am useless"`
    );

    testCompletion("datetime", timedWorkflow, (r) => {
      expect(r.dates).toHaveLength(6);
      expect([...new Set(r.dates)]).toHaveLength(6);
    });

    testCompletion("awsSdkCalls", createAndDestroyWorkflow, "done");

    testCompletion("ent", entityWorkflow, [
      {
        all: expect.arrayContaining([
          {
            namespace: "different",
            n: 1,
          },
          {
            namespace: "another",
            n: 1000,
          },
          {
            namespace: "default",
            n: 9,
          },
          {
            namespace: "another2",
            n: 0,
          },
        ]),
        byN: [
          {
            namespace: "another2",
            n: 0,
          },
          {
            namespace: "different",
            n: 1,
          },
          {
            namespace: "default",
            n: 9,
          },
          {
            namespace: "another",
            n: 1000,
          },
        ],
        byNamespace: [
          {
            namespace: "another",
            n: 1000,
          },
          {
            namespace: "another2",
            n: 0,
          },
          {
            namespace: "default",
            n: 9,
          },
          {
            namespace: "different",
            n: 1,
          },
        ],
        filterByNamespace: [
          {
            namespace: "another",
            n: 1000,
          },
        ],
        betweenN: [
          {
            namespace: "default",
            n: 9,
          },
        ],
        greaterThanN: [
          {
            namespace: "default",
            n: 9,
          },
          {
            namespace: "another",
            n: 1000,
          },
        ],
        reverse: [
          {
            namespace: "different",
            n: 1,
          },
          {
            namespace: "default",
            n: 9,
          },
        ],
        sparse: [
          {
            namespace: "another2",
            n: 0,
          },
          {
            namespace: "another",
            n: 1000,
          },
        ],
        inlineBetween: [
          {
            namespace: "another2",
            n: 0,
          },
        ],
      },
      { n: 10 },
      [
        { counterNumber: 1, n: 1 },
        { counterNumber: 2, n: 2 },
        { counterNumber: 3, n: 1 },
      ],
      expect.arrayContaining([
        { counterNumber: 1, n: 1 },
        { counterNumber: 2, n: 2 },
        { counterNumber: 3, n: 1 },
      ]),
      // testing optional set, optional field should be erased
      [{ n: 2 }, { n: 2 }],
    ]);

    testCompletion("transaction", transactionWorkflow, ([one, two, three]) => {
      expect(one).not.toBeUndefined();
      expect(two).not.toBeUndefined();
      expect(three).not.toBeUndefined();
    });

    testCompletion("buckets", bucketWorkflow, {
      result: { data: "hello!", keys: [expect.stringContaining("key/")] },
      signalResult: { data: "hello!" },
      signalResult2: { data: "hello again!" },
      signalResult3: { data: "hello again again!" },
      signalResult4: { data: "hello again again again!" },
      copied: "hello again again again!",
    });

    testCompletion("queue", queueWorkflow, { n: 3, fifo_n: 3 });
  },
  {
    name: "s3 persist failures",
    chaos: {
      rules: [
        {
          targets: [ChaosTargets.command("PutObjectCommand", "S3Client")],
          effect: ChaosEffects.reject(),
        },
      ],
      durationMillis: 4000,
    },
    register: ({ testCompletion }) => {
      testCompletion(
        "call task",
        workflow1,
        { name: "sam" },
        "you said hello sam I am hello2 and you were invoked by my-workflow"
      );

      testCompletion("test commands", allCommands, {
        signalCount: 1,
      });
    },
  },
  {
    name: "sqs send failures",
    chaos: {
      rules: [
        {
          targets: [ChaosTargets.command("SendMessageCommand", "SQSClient")],
          effect: ChaosEffects.reject(),
        },
      ],
      durationMillis: 4000,
    },
    testTimeout: 200 * 1000,
    register: ({ testCompletion }) => {
      testCompletion("test commands", allCommands, {
        signalCount: 1,
      });
    },
  }
);

const url = serviceUrl();
const socketUrl = testSocketUrl();

test("hello API should route and return OK response", async () => {
  const restResponse = await (await fetch(`${url}/hello`)).json();
  const rpcResponse = await (
    await fetch(`${url}/${commandRpcPath({ name: "helloApi" })}`, {
      method: "POST",
    })
  ).json();

  expect(restResponse).toEqual("hello world");
  expect(rpcResponse).toEqual("hello world");
});

test("params with schema should parse", async () => {
  const restResponse = await (
    await fetch(`${url}/user/typed1/my-user-id`)
  ).json();

  const rpcResponse = await (
    await fetch(`${url}/${commandRpcPath({ name: "typed1" })}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "my-user-id",
      }),
    })
  ).json();

  const expectedResponse = {
    userId: "my-user-id",
    createdTime: new Date(0).toISOString(),
  };

  expect(restResponse).toEqual(expectedResponse);
  expect(rpcResponse).toEqual(expectedResponse);
});

test("output with schema should serialize", async () => {
  const restResponse = await (
    await fetch(`${url}/user/typed2/my-user-id`)
  ).json();

  const rpcResponse = await (
    await fetch(`${url}/${commandRpcPath({ name: "typed2" })}`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "my-user-id",
      }),
    })
  ).json();

  const expected = {
    userId: "my-user-id",
    createdTime: new Date(0).toISOString(),
  };

  expect(restResponse).toEqual(expected);
  expect(rpcResponse).toEqual(expected);
});

test("middleware context is properly piped to command", async () => {
  const rpcResponse = await (
    await fetch(`${url}/${commandRpcPath({ name: "extractHeaderCommand" })}`, {
      method: "POST",
      body: JSON.stringify({
        userId: "my-user-id",
      }),
      headers: {
        MyHeader: "value",
        "Content-Type": "application/json",
      },
    })
  ).json();

  expect(rpcResponse).toMatchObject({
    MyHeader: "value",
  });
});

test("middleware can respond early", async () => {
  const rpcResponse = await (
    await fetch(
      `${url}/${commandRpcPath({ name: "earlyMiddlewareResponse" })}`,
      {
        method: "POST",
        body: JSON.stringify({
          userId: "my-user-id",
        }),
      }
    )
  ).text();

  expect(rpcResponse).toEqual('"Early Response"');
});

test("middleware response through service client", async () => {
  const serviceClient = new ServiceClient<typeof TestService>({
    serviceUrl: url,
  });

  await expect(serviceClient.earlyMiddlewareResponse()).resolves.toEqual(
    "Early Response"
  );
});

test("middleware can edit response", async () => {
  const rpcResponse = await fetch(
    `${url}/${commandRpcPath({ name: "modifyResponseMiddleware" })}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "my-user-id",
      }),
    }
  );

  expect(rpcResponse.headers.get("ModifiedHeader")).toEqual("Injected Header");
});

test("test service context", async () => {
  const serviceClient = new ServiceClient<typeof TestService>({
    serviceUrl: url,
  });

  await expect(
    serviceClient.contextText()
  ).resolves.toMatchObject<ServiceContext>({
    serviceName: "eventual-tests",
    serviceUrl: url,
  });
});

test("socket test", async () => {
  const executionId = (await (
    await fetch(`${url}/${commandRpcPath({ name: "socketTest" })}`, {
      method: "POST",
    })
  ).json()) as string;

  const encodedId = encodeURIComponent(executionId);

  console.log("pre-socket");

  const ws1 = new WebSocket(`${socketUrl}?id=${encodedId}&n=0`);
  const ws2 = new WebSocket(`${socketUrl}?id=${encodedId}&n=1`);

  console.log("setup-socket");

  const running1 = setupWS(executionId, ws1);
  const running2 = setupWS(executionId, ws2);

  console.log("waiting...");

  const result = await Promise.all([running1, running2]);

  expect(result).toEqual([3, 4]);
});

function setupWS(executionId: string, ws: WebSocket) {
  let n: number | undefined;
  let v: number | undefined;
  return new Promise<number>((resolve, reject) => {
    ws.on("error", (err) => {
      console.log("error", err);
      reject(err);
    });
    ws.on("message", (data) => {
      // test: invalid call, should not crash the server
      ws.send(
        JSON.stringify({
          id: "",
          v: 0,
        } satisfies SocketMessage)
      );

      try {
        console.log(n, "message");
        const d = (data as Buffer).toString("utf8");
        console.log(d);
        const event = JSON.parse(d) as StartSocketEvent | DataSocketEvent;
        if (event.type === "start") {
          n = event.n;
          // after connecting, we will send our "n" and incremented "value" back.
          ws.send(
            JSON.stringify({
              id: executionId,
              v: event.v + 1,
            } satisfies SocketMessage)
          );
        } else if (event.type === "data") {
          v = event.v;
        } else {
          console.log("unexpected event", event);
          reject(event);
        }
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
    ws.on("close", (code, reason) => {
      try {
        console.log(code, reason.toString("utf-8"));
        console.log(n, "close", v);
        if (n === undefined) {
          throw new Error("n was not set");
        }
        resolve(v ?? -1);
      } catch (err) {
        reject(err);
      }
    });
  });
}

if (!process.env.TEST_LOCAL) {
  test("index.search", async () => {
    const serviceClient = new ServiceClient<typeof TestService>({
      serviceUrl: url,
    });

    await serviceClient.indexBlog({
      blogId: "blog-id-1",
      title: "fluffy pillows",
      content: "i like fluffy pillows, they are super comfy",
    });

    // wait 10s to ensure indexing has completed
    await new Promise((resolve) => setTimeout(resolve, 10 * 1000));

    await expect(
      serviceClient.searchBlog({
        query: "fluffy pillows",
      })
    ).resolves.toEqual<Awaited<ReturnType<typeof serviceClient.searchBlog>>>({
      item: {
        title: "fluffy pillows",
        content: "i like fluffy pillows, they are super comfy",
      },
      count: 1,
    });
  });
}
