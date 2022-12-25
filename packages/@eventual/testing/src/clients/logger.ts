import { Logger } from "@eventual/core";

export class TestLogger implements Logger {
  public createChild(_options: {
    persistentLogAttributes: Record<string, any>;
  }): Logger {
    return this;
  }

  public addPersistentLogAttributes(_attribute: Record<string, any>): void {
    return undefined;
  }

  public debug(message: string): void {
    console.debug(message);
  }

  public error(message: string): void {
    console.error(message);
  }

  public info(message: string): void {
    console.info(message);
  }

  public warn(message: string): void {
    console.warn(message);
  }
}
