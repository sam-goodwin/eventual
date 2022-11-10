// @ts-nocheck

const doWork = activity("doWork", async (input: any) => input);

export default eventual(async (input) => {
  const items = await doWork(input);

  await items.map(async (item) => {
    await doWork(item);
  });
});
