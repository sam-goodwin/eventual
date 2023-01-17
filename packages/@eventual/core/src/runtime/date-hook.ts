const originalDate = globalThis.Date;
const originalDateNow = globalThis.Date.now;
const HOOKED_SYMBOL = Symbol.for("eventual-hooked-date");

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
export function hookDate(getDate: () => number | undefined) {
  globalThis.Date = class extends Date {
    constructor(...args: Parameters<typeof Date>) {
      if (args.length === 0) {
        super(getDate() ?? originalDateNow());
      } else {
        super(...args);
      }
    }
  } as typeof Date;
  globalThis.Date.now = () => getDate() ?? originalDateNow();
  (globalThis.Date as any)[HOOKED_SYMBOL] = HOOKED_SYMBOL;
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
  globalThis.Date.now = originalDateNow;
  delete (globalThis.Date as any)[HOOKED_SYMBOL];
}
