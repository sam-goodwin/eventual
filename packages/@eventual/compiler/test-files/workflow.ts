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

  sleepWhileNot(() => true);

  const func = () =>
    Promise.all(
      items.map(async (item) => {
        await doWork(item);
      })
    );

  await func();

  const func2 = async () => {
    await Promise.all(
      items.map(async (item) => {
        await doWork(item);
      })
    );
  };

  await func2();
});

export const workflow2 = workflow(
  "timeoutFlow",
  { timeoutSeconds: 100 },
  async () => {
    await doWork("something");
  }
);

export const workflow3 = workflow("timeoutFlow", async () => {
  await callMe();

  async function callMe() {
    await sleepFor(20);
  }
});
