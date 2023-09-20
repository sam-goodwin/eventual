import {
  Dirent,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";

export interface LocalSerializable {
  serialize(): Record<string, Buffer>;
}

/**
 * A local persistance store for local runtime data.
 *
 * Intentionally synchronous to support constructors and ensure a consistent point in time when saving.
 */
export class LocalPersistanceStore implements PersistanceStore {
  private stores: Record<string, LocalSerializable> = {};
  constructor(private loc: string) {}

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
          files.flatMap((f) => {
            return loadFile(f);

            function loadFile(
              file: Dirent,
              prefix = ""
            ): (readonly [string, Buffer])[] {
              const name = path.join(prefix, file.name);
              const filePath = path.join(dirPath, name);
              if (file.isDirectory()) {
                const files = readdirSync(filePath, {
                  withFileTypes: true,
                });
                return files.flatMap((f) => loadFile(f, name));
              } else {
                return [[name, readFileSync(filePath)] as const];
              }
            }
          })
        );
      }

      console.warn(
        `Failed to load local persistance data at ${this.loc}/${name}: Not a directory.`
      );

      return undefined;
    } catch {
      return undefined;
    }
  }

  public save() {
    Object.entries(this.stores).forEach(async ([name, serializable]) => {
      const serialized = serializable.serialize();
      const storePath = path.join(this.loc, name);
      mkdirSync(storePath, { recursive: true });
      Object.entries(serialized).forEach(([fileName, data]) => {
        const entryPath = path.join(storePath, fileName);
        mkdirSync(path.dirname(entryPath), { recursive: true });
        writeFileSync(entryPath, data);
      });
    });
  }
}

export interface PersistanceStore {
  register<T extends LocalSerializable>(
    name: string,
    factory: (data?: Record<string, Buffer>) => T
  ): T;
  save(): void;
}

export class NoPersistanceStore implements PersistanceStore {
  public register<T extends LocalSerializable>(
    _name: string,
    factory: (data?: Record<string, Buffer> | undefined) => T
  ): T {
    return factory();
  }

  public save(): void {
    return undefined;
  }
}
