/**
 * This file patches Node's Promise type, making it cancellable and without memory leaks.
 *
 * It makes use of AsyncLocalStorage to achieve this:
 * https://nodejs.org/api/async_context.html#class-asynclocalstorage
 */

import { AsyncLocalStorage } from "async_hooks";
import { isPromise } from "util/types";

const storage = new AsyncLocalStorage<CancelState>();

const _then = Promise.prototype.then;
const _catch = Promise.prototype.catch;
const _finally = Promise.prototype.finally;

const _Promise = Promise;

// @ts-ignore - naughty naughty
globalThis.Promise = function (executor: any) {
  if (isCancelled()) {
    // if the local storage has a cancelled flag, break the Promise chain
    return new _Promise(() => {});
  }
  return new _Promise(executor);
};

globalThis.Promise.resolve = <T>(
  ...args: [] | [value: T]
): Promise<Awaited<T> | void> => {
  if (args.length === 0) {
    return new Promise((resolve) => resolve(void 0));
  }
  const [value] = args;
  return new Promise(async (resolve) =>
    isPromise(value)
      ? (value as Promise<Awaited<typeof value>>).then(resolve)
      : resolve(value as Awaited<typeof value>)
  );
};

globalThis.Promise.reject = <T = never>(reason?: any): Promise<T> => {
  return new Promise(async (_, reject) => reject(reason));
};

globalThis.Promise.all = _Promise.all;
globalThis.Promise.allSettled = _Promise.allSettled;
globalThis.Promise.any = _Promise.any;
globalThis.Promise.race = _Promise.race;

Promise.prototype.then = function (outerResolve, outerReject) {
  const p = (_then as typeof _then<any, any>).call(this, (value) => {
    if (!isCancelled()) {
      outerResolve?.(value);
    }
  });
  return outerReject ? p.catch(outerReject) : p;
};

Promise.prototype.catch = function (outerReject) {
  return (_catch as typeof _catch<any>).call(this, (err) => {
    if (!isCancelled()) {
      outerReject?.(err);
    }
  });
};

Promise.prototype.finally = function (outerFinally) {
  console.log("finally 1");
  return _finally.call(this, () => {
    console.log("finally 2");
    if (!isCancelled()) {
      console.log("finally 3");
      return outerFinally?.();
    }
  });
};

function isCancelled() {
  const state = storage.getStore();
  return state?.cancelled === true;
}

export function cancelLocalPromises() {
  (storage.getStore() as CancelState | undefined)?.cancel();
}

interface CancelState {
  cancelled: boolean;
  cancel(): void;
}

interface CancellablePromise<T> extends Promise<T> {
  cancel(): void;
}

export function cancellable<T>(fn: () => Promise<T>): CancellablePromise<T> {
  const state: CancelState = {
    cancelled: false,
    cancel: () => {},
  };
  return storage.run(state, () => {
    let _reject: (reason?: any) => void;
    const promise = new Promise<T>((resolve, reject) => {
      _reject = reject;
      fn().then(resolve).catch(reject);
    });
    state.cancel = (promise as any).cancel = function () {
      state.cancelled = true;
      _reject(new Error("cancelled"));
    };
    return promise as CancellablePromise<T>;
  });
}
