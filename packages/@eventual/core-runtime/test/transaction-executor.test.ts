import { entity as _entity, event, TransactionContext } from "@eventual/core";
import { entities, registerEntityHook, Result } from "@eventual/core/internal";
import { jest } from "@jest/globals";
import { EntityClient } from "../src/clients/entity-client.js";
import { EventClient } from "../src/clients/event-client.js";
import { ExecutionQueueClient } from "../src/clients/execution-queue-client.js";
import { NoOpLocalEnvConnector } from "../src/local/local-container.js";
import { LocalEntityStore } from "../src/local/stores/entity-store.js";
import { EntityStore } from "../src/stores/entity-store.js";
import {
  createTransactionExecutor,
  TransactionExecutor,
  TransactionResult,
} from "../src/transaction-executor.js";

const entity = (() => {
  let n = 0;
  return <E>() => {
    // eslint-disable-next-line no-empty
    while (entities().has(`ent${++n}`)) {}
    return _entity<E>(`ent${n}`);
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

const event1 = event("event1");

beforeEach(() => {
  jest.resetAllMocks();

  store = new LocalEntityStore({
    localConnector: NoOpLocalEnvConnector,
  });

  registerEntityHook(new EntityClient(store));

  executor = createTransactionExecutor(
    store,
    mockExecutionQueueClient,
    mockEventClient
  );
});

const context: TransactionContext = {
  service: {
    serviceName: "service",
  },
};

test("just get", async () => {
  const d1 = entity<number>();
  const result = await executor(
    () => {
      return d1.get("1");
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });
});

test("just set", async () => {
  const d1 = entity<number>();
  const result = await executor(
    () => {
      return d1.set("1", 1);
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved({ version: 1 }),
  });

  await expect(store.getEntityValue(d1.name, "1")).resolves.toEqual({
    entity: 1,
    version: 1,
  });
});

test("just delete", async () => {
  const d1 = entity<number>();

  await store.setEntityValue(d1.name, "1", 0);

  const result = await executor(
    () => {
      return d1.delete("1");
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.getEntityValue(d1.name, "1")).resolves.toBeUndefined();
});

test("multiple operations", async () => {
  const d1 = entity<number>();
  const d2 = entity<string>();

  const result = await executor(
    async () => {
      await d1.set("1", 1);
      await d2.set("1", "a");
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.getEntityValue(d1.name, "1")).resolves.toEqual({
    entity: 1,
    version: 1,
  });

  await expect(store.getEntityValue(d2.name, "1")).resolves.toEqual({
    entity: "a",
    version: 1,
  });
});

test("multiple operations fail", async () => {
  const d1 = entity<number>();
  const d2 = entity<string>();

  await store.setEntityValue(d1.name, "1", 0);

  const result = await executor(
    async () => {
      await d1.set("1", 1, { expectedVersion: 3 });
      await d2.set("1", "a");
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.failed(Error("Failed after an explicit conflict.")),
  });

  await expect(store.getEntityValue(d1.name, "1")).resolves.toEqual({
    entity: 0,
    version: 1,
  });

  await expect(store.getEntityValue(d2.name, "1")).resolves.toBeUndefined();
});

test("retry when retrieved data changes version", async () => {
  const d1 = entity<number>();

  await store.setEntityValue(d1.name, "1", 0);

  const result = await executor(
    async () => {
      const v = await d1.get("1");
      // this isn't kosher... normally
      if (v === 0) {
        await store.setEntityValue(d1.name, "1", v! + 1);
      }
      await d1.set("1", v! + 1);
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.getEntityValue(d1.name, "1")).resolves.toEqual({
    entity: 2,
    version: 3,
  });
});

test("retry when retrieved data changes version multiple times", async () => {
  const d1 = entity<number>();

  await store.setEntityValue(d1.name, "1", 0);

  const result = await executor(
    async () => {
      const v = (await d1.get("1")) ?? 0;
      // this isn't kosher... normally
      if (v < 2) {
        await store.setEntityValue(d1.name, "1", v + 1);
      }
      await d1.set("1", v + 1);
    },
    undefined,
    context
  );

  expect(result).toEqual<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  await expect(store.getEntityValue(d1.name, "1")).resolves.toEqual({
    entity: 3,
    version: 4,
  });
});

test("emit events on success", async () => {
  const d1 = entity<number>();

  const result = await executor(
    async () => {
      event1.emit({ n: 1 });
      await d1.set("1", 1);
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
  const d1 = entity<number>();

  await store.setEntityValue(d1.name, "1", 0);

  const result = await executor(
    async () => {
      event1.emit({ n: 1 });
      const v = await d1.get("1");
      event1.emit({ n: v });
      // this isn't kosher... normally
      if (v === 0) {
        await store.setEntityValue(d1.name, "1", v! + 1);
      }
      await d1.set("1", v! + 1);
      event1.emit({ n: 1 });
    },
    undefined,
    context
  );

  expect(result).toMatchObject<TransactionResult<any>>({
    result: Result.resolved(undefined),
  });

  expect(mockEventClient.emitEvents).toHaveBeenCalledTimes(3);
});

test("events not emitted on failure", async () => {
  const d1 = entity<number>();

  await store.setEntityValue(d1.name, "1", 0);

  const result = await executor(
    async () => {
      event1.emit({ n: 1 });
      await d1.set("1", 1, { expectedVersion: 1000 });
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
