import { LogLevel } from "./log-agent.js";

const originalConsole = globalThis.console;
const HOOKED_SYMBOL = Symbol.for("eventual-hooked-console");

/**
 * Call a callback when
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
      const newData = hook("INFO", data);
      if (newData) {
        originalConsole.info(...newData);
      }
    },
    log: (...data: any[]) => {
      const newData = hook("INFO", data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    debug: (...data: any[]) => {
      const newData = hook("DEBUG", data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    error: (...data: any[]) => {
      const newData = hook("ERROR", data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    warn: (...data: any[]) => {
      const newData = hook("WARN", data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
    trace: (...data: any[]) => {
      const newData = hook("TRACE", data);
      if (newData) {
        originalConsole.log(...newData);
      }
    },
  };
  globalThis.console = consoleProxy;
}

export function isConsoleHooked() {
  return HOOKED_SYMBOL in globalThis.console;
}

export function restoreConsole() {
  globalThis.console = originalConsole;
}
