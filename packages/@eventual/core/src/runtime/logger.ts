export interface Logger {
  createChild(options: {
    persistentLogAttributes: Record<string, any>;
  }): Logger;
  addPersistentLogAttributes(attribute: Record<string, any>): void;
  debug(message: string): void;
  error(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}
