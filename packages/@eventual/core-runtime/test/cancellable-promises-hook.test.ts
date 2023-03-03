import {
  cancellable,
  cancelLocalPromises,
} from "../src/cancellable-promise-hook.js";
import { jest } from "@jest/globals";
import { isPromise } from "util/types";

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function never() {
  return new Promise(() => {});
}

// const myPromise = cancellable(async () => {
//   console.log("function called");

//   try {
//     // trigger an await
//     await sleep(0);

//     cancelLocalPromises();

//     console.log("in between sleep");

//     // uncomment for test
//     // cancel();

//     // trigger another wait
//     await sleep(0);

//     console.log("I will never be called 1");
//   } catch (err) {
//     console.log("I will never be called 2", err);
//   } finally {
//     console.log("I will never be called 3");
//   }
//   console.log("I will never be called 4");
// });

// try {
//   await new Promise((resolve, reject) => {
//     // wrapping this in a new Promise prevents the async local storage from
//     // leaking into the parent

//     // `await myPromise` binds its local storage to the outer promise it seems
//     return myPromise.then(resolve).catch(reject);
//   });
//   console.log("Promise was not cancelled");
// } catch (err) {
//   console.log("Promise was cancelled");
// }

test("no cancel", async () => {
  const fn = jest.fn();
  const myPromise = cancellable(async () => {
    // trigger an await
    await sleep(0);
    fn();
  });

  await myPromise;
  expect(fn).toBeCalled();
});

test("cancel", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      // trigger an await
      await sleep(0);
      fn();

      cancelLocalPromises();

      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(1);
});

test("cancel in catch", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await sleep(0);
        fn();
        cancelLocalPromises();
      } catch {
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(1);
});

test("cancel with nested", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await sleep(0);
        await (async () => {
          await sleep(0);
          fn();
          await sleep(0);
          fn();
        })();
        fn();
        cancelLocalPromises();
      } catch {
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(3);
});

test("cancel with dangling", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await sleep(0);
        (async () => {
          sleep(0);
          fn();
          sleep(0);
          fn();
        })();
        fn();
        cancelLocalPromises();
      } catch {
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(3);
});

test("cancel with never resolving", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await sleep(0);
        (async () => {
          await never();
        })();
        fn();
        cancelLocalPromises();
      } catch {
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(1);
});

test("test all", async () => {
  const fn = jest.fn();
  await cancellable(async () => {
    fn();
    await Promise.all([sleep(0), sleep(0)]);
    fn();
  });

  expect(fn).toBeCalledTimes(2);
});

test("cancel with all", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await Promise.all([
          sleep(0),
          never(),
          sleep(0).then(() => {
            fn();
            cancelLocalPromises();
          }),
        ]);
      } catch (err) {
        console.error(err);
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(1);
});

test("cancel with all settled", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await Promise.allSettled([
          sleep(0),
          never(),
          sleep(0).then(() => {
            fn();
            cancelLocalPromises();
          }),
        ]);
        fn();
      } catch (err) {
        console.error(err);
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(1);
});

test("cancel with any", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await Promise.any([
          never(),
          sleep(0).then(() => {
            fn();
            cancelLocalPromises();
          }),
        ]);
        fn();
      } catch (err) {
        console.error(err);
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(1);
});

test("cancel with race", async () => {
  const fn = jest.fn();
  await expect(() =>
    cancellable(async () => {
      try {
        // trigger an await
        await Promise.race([
          never(),
          sleep(0).then(() => {
            fn();
            cancelLocalPromises();
          }),
        ]);
        fn();
      } catch (err) {
        console.error(err);
        fn();
      }
      await sleep(0);
      fn();
    })
  ).rejects.toThrow();

  expect(fn).toBeCalledTimes(1);
});

test("isPromise", async () => {
  await cancellable(async () => {
    expect(isPromise(new Promise(() => {}))).toBeTruthy();
  });
});

/**
 * This currently fails, cancellation only rejects the top promise, not all of the children, what value does it do?
 */
test.skip("cancelled child", async () => {
  let p1: Promise<any>;
  const p2 = cancellable(async () => {
    p1 = new Promise(() => {});
    await sleep(0);
    cancelLocalPromises();
    await p1;
  });

  await expect(() => p2!).rejects.toThrow("cancelled");
  await expect(p1!).rejects.toThrow("cancelled");
});

// test("cancel with ordered", async () => {
//   const fn = jest.fn();
//   const fn2 = jest.fn();
//   const fn3 = jest.fn();
//   await expect(() =>
//     cancellable(async () => {
//       try {
//         // trigger an await
//         await sleep(0);
//         fn();
//         cancelLocalPromises();
//       } catch {
//         fn();
//       }
//       await sleep(0);
//       fn();
//     })
//   ).rejects.toThrow();

//   expect(fn).toBeCalledTimes(1);
// });
