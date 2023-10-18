import { rm } from "fs/promises";
import path from "path";
import { NoOpLocalEnvConnector } from "../src/local/local-container.js";
import { LocalPersistanceStore } from "../src/local/local-persistance-store.js";
import { LocalBucketStore } from "../src/local/stores/bucket-store.js";

const __dirname: string =
  typeof global.__dirname === "string"
    ? global.__dirname
    : path.dirname(new URL(import.meta.url).pathname);

describe("persist", () => {
  const storagePath = path.join(__dirname, "./.test_store");
  afterAll(async () => {
    await rm(storagePath, { recursive: true, force: true });
  });
  test("save", async () => {
    const localPersistance = new LocalPersistanceStore(storagePath);
    const bucketStore = localPersistance.register(
      "bucket",
      (_data) => new LocalBucketStore({ localConnector: NoOpLocalEnvConnector })
    );

    await bucketStore.put("bucket", "key", Buffer.from("value"), {
      metadata: { test: "test" },
    });
    await bucketStore.put("bucket", "key/key2", Buffer.from("value2"));
    await bucketStore.put("bucket", "key2", Buffer.from("value3"));
    await bucketStore.put(
      "bucket",
      "key2.something.json",
      Buffer.from('{"key": "value"}')
    );
    await bucketStore.put(
      "bucket",
      "key3--something.json",
      Buffer.from("value5")
    );

    localPersistance.save();
  });
  test("load", async () => {
    const localPersistance = new LocalPersistanceStore(storagePath);
    const bucketStore = localPersistance.register("bucket", (data) =>
      LocalBucketStore.fromSerializedData(
        { localConnector: NoOpLocalEnvConnector },
        data
      )
    );

    await expect(
      bucketStore.get("bucket", "key").then((v) => v?.getBodyString())
    ).resolves.toEqual("value");
    await expect(
      bucketStore.get("bucket", "key").then((v) => v?.metadata)
    ).resolves.toEqual({ test: "test" });
    await expect(
      bucketStore.get("bucket", "key/key2").then((v) => v?.getBodyString())
    ).resolves.toEqual("value2");
    await expect(
      bucketStore.get("bucket", "key2").then((v) => v?.getBodyString())
    ).resolves.toEqual("value3");
    await expect(
      bucketStore
        .get("bucket", "key2.something.json")
        .then((v) => v?.getBodyString())
    ).resolves.toEqual('{"key": "value"}');
    await expect(
      bucketStore
        .get("bucket", "key3--something.json")
        .then((v) => v?.getBodyString())
    ).resolves.toEqual("value5");
  });
});
