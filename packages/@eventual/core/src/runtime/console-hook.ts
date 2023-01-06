import { LogContext, serializeEventualLogContext } from "./log-payloads.js";

const originalConsole = globalThis.console;

export function consoleInjectContext(context: LogContext) {
  const consoleProxy: typeof console = {
    ...originalConsole,
    info: (...data: any[]) => {
      return originalConsole.info(
        serializeEventualLogContext(context),
        ...data
      );
    },
    log: (...data: any[]) => {
      return originalConsole.log(serializeEventualLogContext(context), ...data);
    },
    debug: (...data: any[]) => {
      return originalConsole.debug(
        serializeEventualLogContext(context),
        ...data
      );
    },
    error: (...data: any[]) => {
      return originalConsole.error(
        serializeEventualLogContext(context),
        ...data
      );
    },
    warn: (...data: any[]) => {
      return originalConsole.warn(
        serializeEventualLogContext(context),
        ...data
      );
    },
    trace: (...data: any[]) => {
      return originalConsole.trace(
        serializeEventualLogContext(context),
        ...data
      );
    },
  };
  globalThis.console = consoleProxy;
}

export function restoreConsole() {
  globalThis.console = originalConsole;
}
