import { EntityQueryResult, entity } from "@eventual/core";
import { rm } from "fs/promises";
import path from "path";
import { z } from "zod";
import { EntityProvider } from "../src/index.js";
import { NoOpLocalEnvConnector } from "../src/local/local-container.js";
import { LocalPersistanceStore } from "../src/local/local-persistance-store.js";
import { LocalEntityStore } from "../src/local/stores/entity-store.js";

const __dirname: string =
  typeof global.__dirname === "string"
    ? global.__dirname
    : path.dirname(new URL(import.meta.url).pathname);

const testEntity = entity("myEntity", {
  attributes: { value: z.string() },
  partition: ["value"],
});
const testIndex = testEntity.index("testIndex", { partition: ["value"] });

describe("persist", () => {
  const storagePath = path.join(__dirname, "./.test_store");
  afterAll(async () => {
    await rm(storagePath, { recursive: true, force: true });
  });
  const entityProvider: EntityProvider = {
    getEntity() {
      return testEntity;
    },
  };
  test("save", async () => {
    const localPersistance = new LocalPersistanceStore(storagePath);
    const entityStore = localPersistance.register(
      "entity",
      (_data) =>
        new LocalEntityStore({
          entityProvider,
          localConnector: NoOpLocalEnvConnector,
        })
    );

    await entityStore.put(testEntity.name, { value: "1" });

    localPersistance.save();
  });
  test("load", async () => {
    const localPersistance = new LocalPersistanceStore(storagePath);
    const entityStore = localPersistance.register("entity", (data) =>
      LocalEntityStore.fromSerializedData(
        { entityProvider, localConnector: NoOpLocalEnvConnector },
        data
      )
    );

    await expect(
      entityStore.get(testEntity.name, { value: "1" })
    ).resolves.toEqual({
      value: "1",
    });
    await expect(
      entityStore.scan(testEntity.name)
    ).resolves.toEqual<EntityQueryResult>({
      entries: [{ value: { value: "1" }, version: 1 }],
    });
    await expect(
      entityStore.scanIndex(testEntity.name, testIndex.name)
    ).resolves.toEqual<EntityQueryResult>({
      entries: [{ value: { value: "1" }, version: 1 }],
    });
  });

  test("load without index", async () => {
    await rm(
      `${storagePath}/entity/${testEntity.name}/index/${testIndex.name}`,
      { recursive: true, force: true }
    );
    const localPersistance = new LocalPersistanceStore(storagePath);
    const entityStore = localPersistance.register("entity", (data) =>
      LocalEntityStore.fromSerializedData(
        { entityProvider, localConnector: NoOpLocalEnvConnector },
        data
      )
    );

    await entityStore.put(testEntity.name, { value: "1" });
    await expect(
      entityStore.get(testEntity.name, { value: "1" })
    ).resolves.toEqual({
      value: "1",
    });
    await expect(
      entityStore.scan(testEntity.name)
    ).resolves.toEqual<EntityQueryResult>({
      entries: [{ value: { value: "1" }, version: 2 }],
    });
    await expect(
      entityStore.queryIndex(testEntity.name, testIndex.name, { value: "1" })
    ).resolves.toEqual<EntityQueryResult>({
      entries: [{ value: { value: "1" }, version: 2 }],
    });
  });
});
