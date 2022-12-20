import { Logger } from "@eventual/core";

export class TestLogger implements Logger {
  constructor() {}

  createChild(_options: {
    persistentLogAttributes: Record<string, any>;
  }): Logger {
    return this;
  }
  addPersistentLogAttributes(_attribute: Record<string, any>): void {
    return;
  }
  debug(message: string): void {
    console.debug(message);
  }
  error(message: string): void {
    console.error(message);
  }
  info(message: string): void {
    console.info(message);
  }
  warn(message: string): void {
    console.warn(message);
  }
}
