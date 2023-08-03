/* eslint-disable no-unused-expressions */
import { extendApi } from "@anatine/zod-openapi";
import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  TransactionConflictException,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  ApiSpecification,
  Entity,
  EventualError,
  HeartbeatTimeout,
  HttpResponse,
  Schedule,
  api,
  asyncResult,
  bucket,
  command,
  condition,
  duration,
  entity,
  event,
  expectSignal,
  index,
  sendSignal,
  sendTaskHeartbeat,
  signal,
  subscription,
  task,
  time,
  transaction,
  workflow,
} from "@eventual/core";
import type openapi from "openapi3-ts";
import { Readable } from "stream";
import z from "zod";
import { AsyncWriterTestEvent } from "./async-writer-handler.js";

const sqs = new SQSClient({});
const dynamo = new DynamoDBClient({});

const testQueueUrl = process.env.TEST_QUEUE_URL ?? "";

const hello = task("hello", async (name: string) => {
  return `hello ${name}`;
});

const hello2 = task("hello2", async (name: string, { task, execution }) => {
  return `hello ${name} I am ${task.name} and you were invoked by ${execution.workflowName}`;
});

const localEvent = event<AsyncWriterTestEvent>("LocalAsyncEvent");

export const onAsyncEvent = subscription(
  "onAsyncEvent",
  { events: [localEvent] },
  async (event) => {
    if (event.type === "complete") {
      await asyncTask.sendTaskSuccess({
        taskToken: event.token,
        result: "hello from the async writer!",
      });
    } else {
      await asyncTask.sendTaskFailure({
        taskToken: event.token,
        error: "AsyncWriterError",
        message: "I was told to fail this task, sorry.",
      });
    }
  }
);

export const asyncTask = task(
  "asyncTask",
  async (type: AsyncWriterTestEvent["type"]) => {
    return asyncResult<string>(async (token) => {
      console.log(testQueueUrl);
      if (!process.env.EVENTUAL_LOCAL) {
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: testQueueUrl,
            MessageBody: JSON.stringify({
              type,
              token,
            }),
          })
        );
      } else {
        // when running locally, use an event instead of SQS
        // we do not currently support incoming requests, so the SQS => Lambda could not reach the service without a tunnel/proxy.
        await localEvent.emit({
          type,
          token,
        });
      }
    });
  }
);

const fail = task("fail", async (value: string) => {
  throw new Error(value);
});

export const workflow1 = workflow(
  "my-workflow",
  async ({ name }: { name: string }) => {
    console.log("before");
    const result = await hello2(name);
    console.log("after");
    return `you said ${result}`;
  }
);

export const workflow2 = workflow("my-parent-workflow", async () => {
  const result = await workflow1({ name: "sam" });
  return `user: ${result}`;
});

export const workflow3 = workflow("sleepy", async () => {
  await duration(2);
  await time(new Date(new Date().getTime() + 1000 * 2));
  return `done!`;
});

export const workflow4 = workflow("parallel", async () => {
  const greetings = Promise.all(
    ["sam", "chris", "sam"].map((name) => hello(name))
  );
  const greetings2 = Promise.all(
    ["sam", "chris", "sam"].map(async (name) => {
      const greeting = await hello(name);
      return greeting.toUpperCase();
    })
  );
  const greetings3 = Promise.all([hello("sam"), hello("chris"), hello("sam")]);
  const any = Promise.any([fail("failed"), hello("sam")]);
  const race = Promise.race([fail("failed"), sayHelloInSeconds(100)]);
  return Promise.allSettled([greetings, greetings2, greetings3, any, race]);

  async function sayHelloInSeconds(seconds: number) {
    await duration(seconds);
    return await hello("sam");
  }
});

const mySignal = signal<number>("signal");
const doneSignal = signal("done");

/**
 * the parent workflow uses thr `expectSignal` function to block and wait for events from it's child workflow.
 */
export const parentWorkflow = workflow("parentWorkflow", async () => {
  const child = childWorkflow({ name: "child" });
  while (true) {
    const n = await mySignal.expectSignal({ timeout: duration(10, "seconds") });

    console.log(n);

    if (n > 10) {
      child.sendSignal(doneSignal);
      break;
    }

    child.sendSignal(mySignal, n + 1);
  }

  // join with child
  await child;

  return "done";
});

/**
 * The child workflow shows a different way of having events using handlers, conditions, and local state.
 */
export const childWorkflow = workflow(
  "childWorkflow",
  async (input: { name: string }, { execution: { parentId } }) => {
    let block = false;
    let done = false;
    let last = 0;

    if (!parentId) {
      throw new Error("I need an adult");
    }

    console.log(`Hi, I am ${input.name}`);

    mySignal.onSignal((n) => {
      last = n;
      block = false;
    });
    doneSignal.onSignal(() => {
      done = true;
      block = false;
    });

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!done) {
      sendSignal(parentId, mySignal, last + 1);
      block = true;
      if (
        !(await condition({ timeout: duration(10, "seconds") }, () => !block))
      ) {
        throw new Error("timed out!");
      }
    }

    return "done";
  }
);

const slowTask = task(
  "slowAct",
  { timeout: duration(5, "seconds") },
  () => new Promise((resolve) => setTimeout(resolve, 10 * 1000))
);

const slowTaskWithLongTimeout = task(
  "slowAct2",
  { timeout: duration(110, "seconds") },
  () => new Promise((resolve) => setTimeout(resolve, 10 * 1000))
);

const slowWf = workflow(
  "slowWorkflow",
  { timeout: duration(5, "seconds") },
  () => duration(10)
);

const slowWfWithLongTimeout = workflow(
  "slowWorkflow2",
  { timeout: duration(110, "seconds") },
  () => duration(10)
);

export const timedOutWorkflow = workflow(
  "timedOut",
  { timeout: duration(100, "seconds") },
  async () => {
    // chains to be able to run in parallel.
    const timedOutFunctions = {
      condition: async () => {
        if (
          !(await condition({ timeout: duration(2, "seconds") }, () => false))
        ) {
          throw new Error("Timed Out!");
        }
      },
      signal: async () => {
        await mySignal.expectSignal({ timeout: duration(2, "seconds") });
      },
      task: slowTask,
      workflow: () => slowWf(undefined),
      taskOnInvoke: () =>
        slowTaskWithLongTimeout(undefined, {
          timeout: duration(2, "second"),
        }),
      workflowOnInvoke: () =>
        slowWfWithLongTimeout(undefined, { timeout: duration(2, "seconds") }),
      taskFailImmediately: () =>
        slowTaskWithLongTimeout(undefined, {
          timeout: condition(() => true),
        }),
    };

    return <Record<keyof typeof timedOutFunctions, boolean>>Object.fromEntries(
      await Promise.all(
        Object.entries(timedOutFunctions).map(async ([name, func]) => {
          try {
            await func();
            return [name, false];
          } catch {
            return [name, true];
          }
        })
      )
    );
  }
);

export const asyncWorkflow = workflow(
  "asyncWorkflow",
  { timeout: duration(100, "seconds") }, // timeout eventually
  async () => {
    const result = await asyncTask("complete");

    try {
      await asyncTask("fail");
    } catch (err) {
      return [result, err];
    }
    throw new Error("I should not get here");
  }
);

const taskWithHeartbeat = task(
  "taskWithHeartbeat",
  { heartbeatTimeout: duration(2, "seconds") },
  async ({
    n,
    type,
  }: {
    n: number;
    type: "success" | "no-heartbeat" | "some-heartbeat";
  }) => {
    const delay = (s: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, s * 1000);
      });

    let _n = 0;
    while (_n++ < n) {
      await delay(0.5);
      if (type === "success") {
        await sendTaskHeartbeat();
      } else if (type === "some-heartbeat" && _n < n * 0.33) {
        await sendTaskHeartbeat();
      }
      // no-heartbeat never sends one... woops.
    }
    return n;
  }
);

export const heartbeatWorkflow = workflow(
  "heartbeatWorkflow",
  { timeout: duration(100, "seconds") }, // timeout eventually
  async (n: number) => {
    return await Promise.allSettled([
      taskWithHeartbeat({ n, type: "success" }),
      taskWithHeartbeat({ n, type: "some-heartbeat" }),
      (async () => {
        try {
          return await taskWithHeartbeat({ n, type: "some-heartbeat" });
        } catch (err) {
          if (err instanceof HeartbeatTimeout) {
            return "task did not respond";
          }
          throw new Error("I should not get here");
        }
      })(),
      taskWithHeartbeat({ n, type: "no-heartbeat" }),
    ]);
  }
);

/**
 * A workflow test that tests the {@link event} intrinsic.
 *
 * A subscription to {@link signalEvent} is set up to forward events
 * as signals to the workflow execution.
 *
 * First, this workflow emits an event to the {@link signalEvent}
 * with a signalId of "start" and then waits for that signal to wake
 * this workflow.
 *
 * Then, the {@link sendFinishEvent} task is invoked which sends
 * an event to {@link signalEvent} with signalId of "finish". The workflow
 * waits for this signal to wake it before returning "done!".
 *
 * The final "finish" event is sent to the {@link signalEvent} with a
 * property of `proxy: true` which instructs the handler to send the event
 * back through the {@link signalEvent} handler before sending the signal
 * to the execution.
 *
 * This tests the emits of events from:
 * 1. workflows
 * 2. tasks.
 * 3. event handlers
 *
 * TODO: add a test for api handlers.
 */
export const eventDrivenWorkflow = workflow(
  "eventDrivenWorkflow",
  async (_, ctx) => {
    // emit an event from a workflow (the orchestrator)
    await signalEvent.emit({
      executionId: ctx.execution.id,
      signalId: "start",
    });

    // wait for the event to come back around and wake this workflow
    const { value } = await expectSignal("start", {
      timeout: duration(30, "seconds"),
    });

    sendFinishEvent(ctx.execution.id);

    await expectSignal("finish", {
      timeout: duration(30, "seconds"),
    });

    return value;
  }
);

const SignalEventPayload = z.object({
  executionId: z.string(),
  signalId: z.string(),
  proxy: z.literal(true).optional(),
});

const signalEvent = event("SignalEvent", SignalEventPayload);

export const onSignalEvent = subscription(
  "onSignalEvent",
  {
    events: [signalEvent],
  },
  async ({ executionId, signalId, proxy }) => {
    console.debug("received signal event", { executionId, signalId, proxy });
    if (proxy) {
      // if configured to proxy, re-route this event through the signalEvent
      // reason: to test that we can emit events from within an event handler
      await signalEvent.emit({
        executionId,
        signalId,
      });
    } else {
      // otherwise, send the signal to the workflow
      await sendSignal(executionId, signalId, { value: "done!" });
    }
  }
);

const sendFinishEvent = task("sendFinish", async (executionId: string) => {
  // emit an event from a task
  await signalEvent.emit({
    executionId,
    signalId: "finish",
    // set proxy to true so that this event will route through event bridge again
    // to test that we can emit events from event handlers
    proxy: true,
  });
});

export const failedWorkflow = workflow(
  "failedWorkflow",
  async (wrapError: boolean) => {
    if (wrapError) {
      throw new MyError("I am useless");
    } else {
      // eslint-disable-next-line no-throw-literal
      throw "I am useless";
    }
  }
);

class MyError extends EventualError {
  constructor(message: string) {
    super("MyError", message);
  }
}

export const signalWorkflow = workflow("signalWorkflow", async () => {
  let n = 0;
  mySignal.onSignal(() => {
    n++;
  });
  await doneSignal.expectSignal();
  return n;
});

/**
 * Testing real datetimes is hard.
 *
 * Compute 2 second durations using only {@link Date} and {@link time}.
 */
export const timedWorkflow = workflow("timedWorkflow", async () => {
  let n = 5;
  const dates = [new Date().toISOString()];
  while (n-- > 0) {
    const d = new Date(new Date().getTime() + 1000 * 2);
    dates.push(d.toISOString());
    await time(d);
  }
  return { dates };
});

const resumeSignal = signal("resume");
const notifyEvent = event<{ executionId: string }>("notify");

export const onNotifyEvent = notifyEvent.onEvent(
  "onNotifyEvent",
  async ({ executionId }) => {
    await resumeSignal.sendSignal(executionId);
  }
);

/**
 * A test designed to show that all commands are idempotent.
 *
 * They should not fail a second time or apply a second time.
 */
export const allCommands = workflow("allCommands", async (_, context) => {
  const sendEvent = notifyEvent.emit({
    executionId: context.execution.id,
  });
  const task = hello("sam");
  const timer = duration(1);
  const childWorkflow = workflow1({ name: "amanda" });
  let n = 0;
  mySignal.onSignal(() => {
    n++;
  });
  // prove that only one signal is sent.
  const signalResponse = mySignal.sendSignal(context.execution.id, 1);
  await resumeSignal.expectSignal();
  await Promise.all([task, timer, childWorkflow, signalResponse, sendEvent]);
  return { signalCount: n };
});

export const createTask = task(
  "createTask",
  async (request: { id: string }) => {
    await dynamo.send(
      new PutItemCommand({
        TableName: process.env.TEST_TABLE_NAME,
        Item: {
          pk: { S: request.id },
          ttl: { N: (Math.floor(Date.now() / 1000) + 1000).toString() },
        },
      })
    );
  }
);

export const destroyTask = task(
  "destroyTask",
  async (request: { id: string }) => {
    await dynamo.send(
      new DeleteItemCommand({
        TableName: process.env.TEST_TABLE_NAME,
        Key: { pk: { S: request.id } },
      })
    );
  }
);

export const createAndDestroyWorkflow = workflow(
  "createAndDestroy",
  async (_, { execution }) => {
    await createTask({ id: execution.id });
    await destroyTask({ id: execution.id });
    return "done" as const;
  }
);

export const counter = entity("counter5", {
  attributes: {
    n: z.number(),
    namespace: z.union([
      z.literal("different"),
      z.literal("default"),
      z.literal("another"),
      z.literal("another2"),
    ]),
    id: z.string(),
    optional: z.string().optional(),
  },
  partition: ["namespace", "id"],
});

export const allCounters = counter.index("allCounters", {
  partition: ["id"],
});

export const allCountersByN = counter.index("allCountersByN", {
  partition: ["id"],
  sort: ["n"],
});

export const countersByNamespace = counter.index("countersOrderedByNamespace", {
  partition: ["id"],
  sort: ["namespace"],
});

export const countersByOptional2 = counter.index("countersByOptional2", {
  partition: ["id"],
  sort: ["optional", "n"],
});

export const countersByN = counter.index("countersByN", {
  sort: ["n"],
});

export const counterCollection = entity("counter-collection2", {
  attributes: {
    id: z.string(),
    counterNumber: z.number(),
    n: z.number(),
  },
  partition: ["id"],
  sort: ["counterNumber"],
});

export const counterCollectionOrderByN = counterCollection.index(
  "counterCollectionOrderByN",
  {
    sort: ["n"],
  }
);

const entityEvent = event<{ id: string }>("entityEvent");
const entitySignal = signal("entitySignal");
const entitySignal2 = signal<{ n: number }>("entitySignal2");
const entityOrderSignal = signal<{ n: number }>("entityOrderSignal");

export const counterWatcher = counter.stream(
  "counterWatcher",
  { operations: ["modify", "remove"], includeOld: true },
  async (item) => {
    const { n } = item.oldValue!;
    if (item.operation === "remove") {
      console.log(item);
      await entitySignal2.sendSignal(item.key.id, { n: n + 1 });
    } else if (item.newValue.namespace === "default") {
      await entityOrderSignal.sendSignal(item.key.id, { n });
    }
  }
);

export const counterNamespaceWatcher = counter.batchStream(
  "counterNamespaceWatch",
  { queryKeys: [{ namespace: "different" }], operations: ["insert"] },
  async (items) => {
    await Promise.all(
      items.map(async (item) => {
        console.log(item);
        const value = await counter.get(item.key);
        await counter.put({
          namespace: "default",
          id: value!.id,
          n: (value?.n ?? 0) + 1,
          optional: undefined,
        });
        console.log("send signal to", value!.id);
        await entitySignal.sendSignal(value!.id);
      })
    );
  }
);

export const onEntityEvent = subscription(
  "onEntityEvent",
  { events: [entityEvent] },
  async ({ id }) => {
    const value = await counter.get({ namespace: "default", id });
    await counter.put({
      namespace: "default",
      id,
      n: (value?.n ?? 0) + 1,
      optional: undefined,
    });
    await entitySignal.sendSignal(id);
  }
);

export const entityTask = task(
  "entityTask",
  async (_, { execution: { id } }) => {
    const value = await counter.get(["default", id]);
    await counter.put({
      namespace: "default",
      id,
      n: (value?.n ?? 0) + 1,
      optional: undefined,
    });
  }
);

export const entityIndexTask = task(
  "entityIndexTask",
  async (_, { execution: { id } }) => {
    await counter.put({
      namespace: "another",
      id,
      n: 1000,
      optional: "hello",
    });
    await counter.put({
      namespace: "another2",
      id,
      n: 0,
      optional: "hello",
    });
    const queryOptions = { select: ["n", "namespace"] } as const;
    const queries = {
      all: allCounters.query({ id }, queryOptions),
      byN: allCountersByN.query({ id }, queryOptions),
      byNamespace: countersByNamespace.query({ id }, queryOptions),
      filterByNamespace: countersByN.query(
        { namespace: "another", id },
        queryOptions
      ),
      betweenN: allCountersByN.query(
        {
          id,
          n: { $between: [2, 100] },
        },
        queryOptions
      ),
      greaterThanN: allCountersByN.query(
        {
          id,
          n: { $gt: 1 },
        },
        queryOptions
      ),
      reverse: countersByNamespace.query(
        { id, namespace: { $beginsWith: "d" } },
        { direction: "DESC", ...queryOptions }
      ),
      // sparse indices only include records with the given field
      sparse: countersByOptional2.query({ id }, queryOptions),
      // between using a multi-attribute key
      inlineBetween: countersByOptional2.query(
        {
          id,
          $between: [{ optional: "h" }, { optional: "hello", n: 0 }],
        },
        queryOptions
      ),
    };

    const result = Object.fromEntries(
      await Promise.all(
        Object.entries(queries).map(
          async ([name, q]) =>
            [
              name,
              (
                await q
              ).entries?.map((e) => {
                // @ts-expect-error - the queries should all use query.select to return only namespace and n
                e.value.id;
                // @ts-check
                e.value.n;
                // @ts-check - should not error
                return e.value;
              }),
            ] as const
        )
      )
    ) as Record<keyof typeof queries, { n: number; namespace: string }[]>;
    return result;
  }
);

export const entityWorkflow = workflow(
  "entityWorkflow",
  async (_, { execution: { id } }) => {
    let orderValue = 0;
    // this signal handler is intended to test that the counter stream is executed in order.
    // it sends a signal each time the "default" name space counter is updated
    // and we want to check if the order is always increasing
    // and then validate the order value against the final value at the end.
    entityOrderSignal.onSignal(({ n }) => {
      if (n >= orderValue) {
        orderValue = n;
      } else {
        throw new Error(
          `order value ${n} is less than previous value ${orderValue}, the stream handler executed out of order!`
        );
      }
    });

    await counter.put({ namespace: "default", id, n: 1, optional: undefined });
    await counter.put({
      namespace: "different",
      id,
      n: 1,
      optional: undefined,
    });
    await entitySignal.expectSignal();
    await entityTask();
    await Promise.all([entityEvent.emit({ id }), entitySignal.expectSignal()]);
    try {
      // will fail
      await counter.put(
        { namespace: "default", id, n: 0, optional: undefined },
        { expectedVersion: 1 }
      );
    } catch (err) {
      console.error("expected the entity set to fail", err);
    }
    const { value: entityValue, version } =
      (await counter.getWithMetadata(["default", id])) ?? {};
    await counter.put(
      { namespace: "default", id, n: entityValue!.n + 1, optional: undefined },
      { expectedVersion: version }
    );
    const value = await counter.get(["default", id]);
    await Entity.transactWrite([
      {
        entity: counter,
        operation: "put",
        value: { namespace: "default", id, n: (value?.n ?? 0) + 1 },
      },
    ]);

    const result0 = await entityIndexTask();

    // send deletion, to be picked up by the stream
    const [, result1] = await Promise.all([
      counter
        .delete(["default", id])
        .then(() => counter.query(["default", id])),
      // this must be expected prior to sending the delete request or else there is a race condition
      entitySignal2.expectSignal(),
    ]);

    if (
      // wait 30 seconds for the order value to match the final value.
      !(await condition(
        { timeout: duration(30, "seconds") },
        () => value?.n === orderValue
      ))
    ) {
      throw new Error(
        `Order handler never received the final value! have: ${orderValue} expected: ${value?.n}`
      );
    }

    /**
     * Testing sort keys and query
     */

    await Promise.all([
      counterCollection.put({ id, counterNumber: 1, n: 1 }),
      counterCollection.put({ id, counterNumber: 2, n: 1 }),
      counterCollection.put({ id, counterNumber: 3, n: 1 }),
    ]);

    const counter1 = await counterCollection.get({ id, counterNumber: 1 });
    await counterCollection.put({
      id,
      counterNumber: 2,
      n: (counter1?.n ?? 0) + 1,
    });

    const counters = await counterCollection.query(
      { id },
      // only return the n and counterNumber attributes
      { select: ["n", "counterNumber"] }
    );
    const countersInOrder = await counterCollectionOrderByN.query(
      { id },
      { select: ["n", "counterNumber"] }
    );

    return [
      result0,
      result1,
      counters.entries?.map((c) => {
        // @ts-expect-error - the queries should all use query.select to return only namespace and n
        c.value.id;
        // @ts-check - should not error
        c.value.counterNumber;
        // @ts-check - should not error
        return c.value;
      }),
      countersInOrder.entries?.map((c) => {
        // @ts-expect-error - the queries should all use query.select to return only namespace and n
        c.value.id;
        // @ts-check - should not error
        c.value.counterNumber;
        // @ts-check - should not error
        return c.value;
      }),
    ];
  }
);

export const check = entity("check4", {
  attributes: { n: z.number(), id: z.string() },
  partition: ["id"],
});

const gitErDone = transaction("gitErDone", async ({ id }: { id: string }) => {
  const val = await check.get([id]);
  await check.put({ id, n: val?.n ?? 0 + 1 });
  return val?.n ?? 0 + 1;
});

const noise = task(
  "noiseTask",
  async ({ x }: { x: number }, { execution: { id } }) => {
    let n = 100;
    let transact: Promise<number> | undefined;
    while (n-- > 0) {
      try {
        await check.put({ id, n });
      } catch (err) {
        console.error(err);
        if (
          !(
            err instanceof TransactionConflictException ||
            (!!err &&
              typeof err === "object" &&
              "name" in err &&
              err.name === "TransactionConflictException")
          )
        ) {
          throw err;
        }
      }
      console.log(n);
      if (n === x) {
        transact = gitErDone({ id });
      }
    }
    console.log("waiting...");
    try {
      return await transact;
    } catch (err) {
      console.error("Transaction Errored", err);
      throw err;
    }
  }
);

export const transactionWorkflow = workflow(
  "transactionWorkflow",
  async (_, { execution: { id } }) => {
    const one = await noise({ x: 40 });
    const two = await noise({ x: 60 });
    const [, three] = await Promise.allSettled([
      check.put({ id, n: two ?? 0 + 1 }),
      gitErDone({ id }),
      check.put({ id, n: two ?? 0 + 1 }),
    ]);
    await check.delete([id]);
    return [one, two, three.status === "fulfilled" ? three.value : "AHHH"];
  }
);

export const myBucket = bucket("myBucket");
export const bucketSignal = signal<{ data: string }>("bucketSignal");

export const myBucketHandler = myBucket.on(
  "put",
  "myBucketHandler",
  { filters: [{ prefix: "key/" }] },
  async (item) => {
    const executionId = item.key.slice(4);
    const obj = await myBucket.get(item.key);

    if (obj?.body) {
      await bucketSignal.sendSignal(executionId, {
        data: await obj.getBodyString(),
      });
    }
  }
);

export const bucketTask = task(
  "bucketTask",
  async (request: { key: string; prefix: string; data: string }) => {
    await myBucket.put(request.key, request.data);

    const result = await myBucket.get(request.key);

    const keys = await myBucket.list({ prefix: request.key });

    if (!result) {
      throw new Error("");
    }

    return {
      data: await result.getBodyString(),
      keys: keys.objects.map((s) => s.key),
    };
  }
);

/**
 * 1. use {@link bucketTask} to create an object, then return the data and listed keys
 * 2. pickup the write from a stream, emitting a signal to the workflow with the data
 * 3. delete the object
 * 4. return
 */
export const bucketWorkflow = workflow(
  "bucketWorkflow",
  async (_, { execution: { id } }) => {
    const data = "hello!";
    const key = `key/${id}`;

    try {
      const [result, signalResult] = await Promise.all([
        bucketTask({ key, data, prefix: "key/" }),
        bucketSignal.expectSignal({ timeout: duration(5, "minutes") }),
      ]);

      const data2 = "hello again!";

      const [, signalResult2] = await Promise.all([
        myBucket.put(key, data2),
        bucketSignal.expectSignal({ timeout: duration(5, "minutes") }),
      ]);

      const data3 = "hello again again!";

      const [, signalResult3] = await Promise.all([
        myBucket.put(key, Buffer.from(data3)),
        bucketSignal.expectSignal({ timeout: duration(5, "minutes") }),
      ]);

      const data4 = "hello again again again!";

      const [, signalResult4] = await Promise.all([
        myBucket.put(key, Readable.from(Buffer.from(data4))),
        bucketSignal.expectSignal({ timeout: duration(5, "minutes") }),
      ]);

      await myBucket.copyTo(key + "2", key);

      const copiedData = await myBucket.get(key + "2");

      return {
        result,
        signalResult,
        signalResult2,
        signalResult3,
        signalResult4,
        copied: await copiedData?.getBodyString(),
      };
    } finally {
      await Promise.all([myBucket.delete(key), myBucket.delete(key + "2")]);
    }
  }
);

export const hello3 = api.post("/hello3", () => {
  return new HttpResponse("hello?");
});

export const helloApi = command(
  "helloApi",
  {
    path: "/hello",
    output: {
      schema: z.string(),
      description: "default output of hello command",
      restStatusCode: 201,
    },
  },
  async () => {
    return "hello world";
  }
);

// provide a schema for the parameters
export const typed1 = command(
  "typed1",
  {
    path: "/user/typed1/:userId",
    input: z.object({
      userId: extendApi(z.string(), { description: "The user ID to retrieve" }),
    }),
  },
  async ({ userId }) => {
    return {
      userId,
      createdTime: new Date(0).toISOString(),
    };
  }
);

const User = z.object({
  userId: z.string(),
  createdTime: extendApi(z.date(), {
    description: "Time the user was created",
  }),
});

// provide a schema for the output body
export const typed2 = command(
  "typed2",
  {
    path: "/user/typed2/:userId",
    method: "GET",
    params: { detailed: "query" },
    input: z.object({
      userId: z.string(),
      detailed: z.boolean().optional(),
    }),
    output: User,
    handlerTimeout: Schedule.duration(10, "minutes"),
  },
  async (request) => {
    return {
      userId: request.userId,
      createdTime: new Date(0),
    };
  }
);

export const typedPut = command(
  "typedPut",
  {
    path: "/user/typedPut/:userId",
    method: "PUT",
    description:
      "Update a user's info. Will write over whatever was set before.",
    summary: "Update a user's info",
    params: { expectedVersion: { in: "query", name: "ExpectedVersion" } },
    input: z.object({
      // from path
      userId: z.string(),
      // from query string
      expectedVersion: z.number().optional(),
      // from body
      age: z.number(),
    }),
  },
  async (request) => {
    return {
      userId: request.userId,
    };
  }
);

export const specCommand = command(
  "specCommand",
  async (): Promise<openapi.OpenAPIObject> => {
    return ApiSpecification.generate();
  }
);

export const extractHeaderCommand = api
  .use(({ request, context, next }) =>
    next({
      ...context,
      MyHeader: request.headers.get("MyHeader"),
    })
  )
  .command("extractHeaderCommand", (_, context) => context);

export const earlyMiddlewareResponse = api
  .use(() => {
    return new HttpResponse(JSON.stringify("Early Response"));
  })
  .command("earlyMiddlewareResponse", async () => undefined);

export const earlyMiddlewareResponseHttp = api
  .use(() => {
    return new HttpResponse("Early Response");
  })
  .get("/early-middleware-response", async () => {
    return new HttpResponse("Not This");
  });

export const modifyResponseMiddleware = api
  .use(async ({ next, context }) => {
    const response = await next(context);
    response.headers.set("ModifiedHeader", "Injected Header");
    return response;
  })
  .command("modifyResponseMiddleware", async () => undefined);

export const modifyResponseMiddlewareHttp = api
  .use(async ({ next, context }) => {
    const response = await next(context);
    response.headers.set("ModifiedHeader", "Injected Header");
    return response;
  })
  .get(
    "/modify-response-http",
    { description: "modify response middleware" },
    async () => {
      return new HttpResponse("My Response");
    }
  );

export const contextTest = command("contextText", (_, { service }) => {
  return service;
});

const simpleEvent = event<{ value: string }>("simpleEvent");

export const simpleEventHandler = subscription(
  "simpleEventHandler",
  { events: [simpleEvent] },
  (payload) => {
    console.log("hi", payload);
  }
);

export const blogIndex = index("blogIndex", {
  mappings: {
    properties: {
      title: {
        type: "text",
        fields: {
          keyword: {
            type: "keyword",
          },
        },
      },
      content: {
        type: "text",
      },
    },
  },
});

export const indexBlog = command(
  "indexBlog",
  async ({
    blogId,
    title,
    content,
  }: {
    blogId: string;
    title: string;
    content: string;
  }) => {
    await blogIndex.index({
      id: blogId,
      body: {
        title,
        content,
      },
    });
  }
);

export const searchBlog = command(
  "searchBlog",
  async ({ query: queryString }: { query: string }) => {
    const query = {
      match: {
        content: {
          query: queryString,
        },
      },
    } as const;

    const { count } = await blogIndex.count({
      query,
    });

    const result = await blogIndex.search({
      query,
    });

    return {
      item: result.hits.hits[0]?._source,
      count,
    };
  }
);
