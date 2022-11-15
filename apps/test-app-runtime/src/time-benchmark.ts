import { activity, eventual } from "@eventual/core";

export default eventual(async () => {
  for (let i = 0; i < 10000; i++) {
    await trackTime(i, await getTime());
  }
});

const getTime = activity("getTime", async () => {
  return new Date().getTime();
});

const trackTime = activity(
  "trackTime",
  async (i: number, timestamp: number) => {
    console.log(i, new Date().getTime() - timestamp);
  }
);
