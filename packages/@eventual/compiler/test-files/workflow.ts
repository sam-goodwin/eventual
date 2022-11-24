// @ts-nocheck

const doWork = activity("doWork", async (input: any) => input);

export default workflow("workflow", async (input) => {
  const items = await doWork(input);

  await Promise.all(
    items.map(async (item) => {
      await doWork(item);
    })
  );
  // function expression
  await Promise.all(
    items.map(async function (item) {
      await doWork(item);
    })
  );

  await Promise.allSettled(
    items.map(async (item) => {
      await doWork(item);
    })
  );

  await Promise.any(
    items.map(async (item) => {
      await doWork(item);
    })
  );

  await Promise.race(
    items.map(async (item) => {
      await doWork(item);
    })
  );
});
