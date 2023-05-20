import {
  Attributes,
  EntityCompositeKeyPart,
  EntityOptions,
  TransactionContext,
  entity as _entity,
  event,
} from "@eventual/core";
import { Result, entities, registerEntityHook } from "@eventual/core/internal";
import { jest } from "@jest/globals";
import { z } from "zod";
import { EventClient } from "../src/clients/event-client.js";
import { ExecutionQueueClient } from "../src/clients/execution-queue-client.js";
import { NoOpLocalEnvConnector } from "../src/local/local-container.js";
import { LocalEntityStore } from "../src/local/stores/entity-store.js";
import { GlobalEntityProvider } from "../src/providers/entity-provider.js";
import { EntityStore } from "../src/stores/entity-store.js";
import {
  TransactionExecutor,
  TransactionResult,
  createTransactionExecutor,
} from "../src/transaction-executor.js";

const entity = (() => {
  let n = 0;
  return <
    Attr extends Attributes,
    const Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
    const Sort extends EntityCompositeKeyPart<Attr> | undefined = undefined
  >(
    options: EntityOptions<Attr, Partition, Sort>
  ) => {
    // eslint-disable-next-line no-empty
    while (entities().has(`ent${++n}`)) {}
    return _entity<Attr, Partition, Sort>(`ent${n}`, options);
  };
})();

const mockExecutionQueueClient = {
  sendSignal: jest.fn() as ExecutionQueueClient["sendSignal"],
} satisfies Partial<ExecutionQueueClient> as unknown as ExecutionQueueClient;
const mockEventClient = {
  emitEvents: jest.fn() as EventClient["emitEvents"],
} satisfies Partial<EventClient> as unknown as EventClient;

let store: EntityStore;
let executor: TransactionExecutor;

const entityProvider = new GlobalEntityProvider();
const event1 = event("event1");

beforeEach(() => {
  jest.resetAllMocks();

  store = new LocalEntityStore({
    localConnector: NoOpLocalEnvConnector,
    entityProvider,
  });

  registerEntityHook(store);

  executor = createTransactionExecutor(
    store,
    entityProvider,
    mockExecutionQueueClient,
    mockEventClient
  );
});

const context: TransactionContext = {
  service: {
    serviceName: "service",
  },
};

const simpleSchema = { key: z.string(), value: z.number() };

test("just get", async () => {
  const d1 = entity({
    attributes: { key: z.string(), value: z.number() },
    partition: ["key"],
  });
  const result = await executor(
    () => {
      return d1.get({ key: "1" });
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });
});

test("just set", async () => {
  const d1 = entity({ partition: ["key"], attributes: simpleSchema });
  const result = await executor(
    () => {
      return d1.set({ key: "1", value: 1 });
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved({ version: 1 }),
  });

  await expect(store.getWithMetadata(d1.name, { key: "1" })).resolves.toEqual({
    value: { key: "1", value: 1 },
    version: 1,
  });
});

test("just delete", async () => {
  const d1 = entity({ attributes: simpleSchema, partition: ["key"] });

  await store.set(d1.name, { key: "1", value: 0 });

  const result = await executor(
    () => {
      return d1.delete(["1"]);
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.get(d1.name, { key: "1" })).resolves.toBeUndefined();
});

test("multiple operations", async () => {
  const d1 = entity({ attributes: simpleSchema, partition: ["key"] });
  const d2 = entity({
    attributes: simpleSchema,
    partition: ["value"],
  });

  const result = await executor(
    async () => {
      await d1.set({ key: "1", value: 1 });
      await d2.set({ key: "1", value: 1 });
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.getWithMetadata(d1.name, { key: "1" })).resolves.toEqual({
    value: { key: "1", value: 1 },
    version: 1,
  });

  await expect(store.getWithMetadata(d2.name, [1])).resolves.toEqual({
    value: { key: "1", value: 1 },
    version: 1,
  });
});

test("multiple operations fail", async () => {
  const d1 = entity({ attributes: simpleSchema, partition: ["key"] });
  const d2 = entity({
    attributes: simpleSchema,
    partition: ["value"],
  });

  await store.set(d1.name, { key: "1", value: 0 });

  const result = await executor(
    async () => {
      await d1.set({ key: "1", value: 1 }, { expectedVersion: 3 });
      await d2.set({ key: "1", value: 1 });
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.failed(Error("Failed after an explicit conflict.")),
  });

  await expect(store.getWithMetadata(d1.name, ["1"])).resolves.toEqual({
    value: { key: "1", value: 0 },
    version: 1,
  });

  await expect(store.get(d2.name, [1])).resolves.toBeUndefined();
});

test("retry when retrieved data changes version", async () => {
  const d1 = entity({ attributes: simpleSchema, partition: ["key"] });

  await store.set(d1.name, { key: "1", value: 0 });

  const result = await executor(
    async () => {
      const v = await d1.get(["1"]);
      // this isn't kosher... normally
      if (v?.value === 0) {
        await store.set(d1.name, { key: "1", value: v.value + 1 });
      }
      await d1.set({ key: "1", value: v!.value + 1 });
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.getWithMetadata(d1.name, ["1"])).resolves.toEqual({
    value: { key: "1", value: 2 },
    version: 3,
  });
});

test("retry when retrieved data changes version multiple times", async () => {
  const d1 = entity({ attributes: simpleSchema, partition: ["key"] });

  await store.set(d1.name, { key: "1", value: 0 });

  const result = await executor(
    async () => {
      const { value } = (await d1.get(["1"])) ?? { value: 0 };
      // this isn't kosher... normally
      if (value < 2) {
        await store.set(d1.name, { key: "1", value: value + 1 });
      }
      await d1.set({ key: "1", value: value + 1 });
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.getWithMetadata(d1.name, ["1"])).resolves.toEqual({
    value: { key: "1", value: 3 },
    version: 4,
  });
});

test("emit events on success", async () => {
  const d1 = entity({ attributes: simpleSchema, partition: ["key"] });

  const result = await executor(
    async () => {
      event1.emit({ n: 1 });
      await d1.set({ key: "1", value: 1 });
      event1.emit({ n: 1 });
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  expect(mockEventClient.emitEvents).toHaveBeenCalledTimes(2);
});

test("emit events after retry", async () => {
  const d1 = entity({
    attributes: simpleSchema,
    partition: ["key"],
  });

  await store.set(d1.name, { key: "1", value: 0 });

  const result = await executor(
    async () => {
      event1.emit({ n: 1 });
      const v = await d1.get(["1"]);
      event1.emit({ n: v });
      // this isn't kosher... normally
      if (v?.value === 0) {
        await store.set(d1.name, { key: "1", value: v!.value + 1 });
      }
      await d1.set({ key: "1", value: v!.value + 1 });
      event1.emit({ n: 1 });
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  expect(mockEventClient.emitEvents).toHaveBeenCalledTimes(3);
});

test("events not emitted on failure", async () => {
  const d1 = entity({ attributes: simpleSchema, partition: ["key"] });

  await store.set(d1.name, { key: "1", value: 0 });

  const result = await executor(
    async () => {
      event1.emit({ n: 1 });
      await d1.set({ key: "1", value: 1 }, { expectedVersion: 1000 });
      event1.emit({ n: 1 });
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.failed(Error("Failed after an explicit conflict.")),
  });

  expect(mockEventClient.emitEvents).not.toHaveBeenCalled();
});
