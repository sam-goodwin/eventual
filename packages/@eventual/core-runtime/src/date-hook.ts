import { AsyncLocalStorage } from "async_hooks";

const originalDate = globalThis.Date;
const HOOKED_SYMBOL = /* @__PURE__ */ Symbol.for("eventual-hooked-date");

interface DateObj {
  dateOverride: number | undefined;
}

/**
 * In the case that the workflow is bundled with a different instance of eventual/core,
 * put the store in globals.
 */
declare global {
  // eslint-disable-next-line no-var
  var eventualDateHookStore: AsyncLocalStorage<DateObj> | undefined;
}

/**
 * Replaces the node implementation of Date with a hook to get the current datetime.
 *
 * Replaces the empty constructor and `Date.now`.
 *
 * If the getDate callback returns undefined or null, the original Date.now() will be used to get the current date.
 *
 * Use {@link restoreDate} to unto this change.
 * Use {@link isDateHooked} to determine if the Date object is currently hooked
 */
export function hookDate() {
  if (!isDateHooked()) {
    globalThis.Date = class extends Date {
      constructor(...args: Parameters<typeof Date>) {
        if (args.length === 0) {
          super(getDate());
        } else {
          super(...args);
        }
      }

      public static now() {
        return getDate();
      }
    } as DateConstructor;
    (globalThis.Date as any)[HOOKED_SYMBOL] = HOOKED_SYMBOL;
  }
}

function getDate() {
  if (!globalThis.eventualDateHookStore) {
    globalThis.eventualDateHookStore = new AsyncLocalStorage();
  }
  return (
    globalThis.eventualDateHookStore.getStore()?.dateOverride ??
    originalDate.now()
  );
}

export function overrideDateScope<T>(
  initialDate: number | undefined,
  executor: (setDate: (date: number | undefined) => void) => T
) {
  if (!globalThis.eventualDateHookStore) {
    globalThis.eventualDateHookStore = new AsyncLocalStorage();
  }
  const dateObject: DateObj = { dateOverride: initialDate };
  return globalThis.eventualDateHookStore.run(
    dateObject,
    executor,
    (date) => (dateObject.dateOverride = date)
  );
}

/**
 * Determines if the console has been hooked using {@link hookConsole}.
 */
export function isDateHooked() {
  return HOOKED_SYMBOL in globalThis.Date;
}

/**
 * Restore original console.[*] implementation after using {@link hookConsole}.
 */
export function restoreDate() {
  globalThis.Date = originalDate;
}
