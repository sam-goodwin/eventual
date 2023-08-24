import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";

export interface LocalSerializable {
  serialize(): Record<string, Buffer>;
}

/**
 * A local persistance store for local runtime data.
 *
 * Intentionally synchronous to support constructors and ensure a consistent point in time when saving.
 */
export class LocalPersistanceStore {
  private stores: Record<string, LocalSerializable> = {};
  constructor(private loc?: string) {}

  public register<T extends LocalSerializable>(
    name: string,
    factory: (data?: Record<string, Buffer>) => T
  ): T {
    const data = this.getData(name);
    const store = factory(data);
    this.stores[name] = store;
    return store;
  }

  private getData(name: string): Record<string, Buffer> | undefined {
    try {
      const dirPath = `${this.loc}/${name}`;
      const loc = statSync(dirPath);
      if (loc.isDirectory()) {
        const files = readdirSync(dirPath, { withFileTypes: true });
        return Object.fromEntries(
          files.map((f) => {
            const ext = f.name.lastIndexOf(".");
            const name = f.name.substring(0, ext);
            return [name, readFileSync(`${dirPath}/${f.name}`)] as const;
          })
        );
      }

      console.warn(
        `Failed to load local persistance data at ${this.loc}/${name}: Not a directory.`
      );

      return undefined;
    } catch (err) {
      console.warn(
        `Failed to find local persistance data at ${this.loc}/${name}`,
        err
      );
      return undefined;
    }
  }

  public save() {
    Object.entries(this.stores).map(async ([name, serializable]) => {
      const serialized = serializable.serialize();
      mkdirSync(`${this.loc}/${name}`, { recursive: true });
      Object.entries(serialized).map(([fileName, data]) =>
        writeFileSync(`${this.loc}/${name}/${fileName}`, data)
      );
    });
  }
}
