import { LogLevel } from "./log-agent.js";

const originalConsole = globalThis.console;
const HOOKED_SYMBOL = Symbol.for("eventual-hooked-console");

/**
 * Replaces the node implementation of console.[log, info, debug, error, warn, trace]
 * with a hook.
 *
 * If the hook returns data, the underlying implementation will be called.
 *
 * Use {@link restoreConsole} to unto this change.
 * Use {@link isConsoleHooked} to determine if the console is currently hooked
 */
export function hookConsole(
  hook: (logLevel: LogLevel, ...data: any[]) => any[] | undefined
) {
  const consoleProxy: typeof console & {
    [HOOKED_SYMBOL]: typeof HOOKED_SYMBOL;
  } = {
    ...originalConsole,
    [HOOKED_SYMBOL]: HOOKED_SYMBOL,
    info: (...data: any[]) => {
      const newData = hook(LogLevel.INFO, data);
      if (newData) {
        originalConsole.info(...newData);
      }
    },
    log: (...data: any[]) => {
      const newData = hook(LogLevel.INFO, data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    debug: (...data: any[]) => {
      const newData = hook(LogLevel.DEBUG, data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    error: (...data: any[]) => {
      const newData = hook(LogLevel.ERROR, data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    warn: (...data: any[]) => {
      const newData = hook(LogLevel.WARN, data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    trace: (...data: any[]) => {
      const newData = hook(LogLevel.TRACE, data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
  };
  globalThis.console = consoleProxy;
}

/**
 * Determines if the console has been hooked using {@link hookConsole}.
 */
export function isConsoleHooked() {
  return HOOKED_SYMBOL in globalThis.console;
}

/**
 * Restore original console.[*] implementation after using {@link hookConsole}.
 */
export function restoreConsole() {
  globalThis.console = originalConsole;
}
