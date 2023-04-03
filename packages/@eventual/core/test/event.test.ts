import "@jest/globals";
import { event } from "../src/event.js";
import z from "zod";

test("publishEvents should throw error if data does not match schema", async () => {
  const myEvent = event(
    "MyEvent",
    z.object({
      key: z.string({}).min(2),
    })
  );

  await expect(
    myEvent.publishEvents({
      key: "a",
    })
  ).rejects.toThrow(expect.any(Error));
});
