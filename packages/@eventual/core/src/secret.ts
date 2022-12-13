export interface Secret<T> {
  getSecret(): Promise<T>;
}

/**
 * A {@link Secret} implementation that stores the secret hard-coded in plain text.
 *
 * This is an insecure API and should only be used when safe, such as in a dev
 * environment.
 */
export class PlainTextSecret<T = string> implements Secret<T> {
  constructor(readonly value: T) {}

  public getSecret() {
    return Promise.resolve(this.value);
  }
}

export interface CachingConfig {
  /**
   * Whether caching is enabled.
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * Number of milliseconds to cache the secret value for.
   *
   * @default - no TTL, all values are cached indefinitely
   */
  ttl?: number;
}

/**
 * A base implementation of a {@link Secret} that supports caching.
 */
export abstract class BaseCachingSecret<T> implements Secret<T> {
  readonly cachingConfig: CachingConfig;

  #value:
    | {
        value: T;
        refreshTime: Date;
      }
    | undefined;

  constructor(cachingConfig?: CachingConfig) {
    this.cachingConfig = cachingConfig ?? {
      enabled: true,
      ttl: undefined,
    };
  }

  /**
   * Gets a fresh version of the secret from the remote store.
   */
  protected abstract getFreshSecret(): Promise<T>;

  public async getSecret(bustCache?: true): Promise<T> {
    if (
      this.#value === undefined ||
      bustCache ||
      !this.cachingConfig.enabled ||
      (this.#value &&
        this.cachingConfig.ttl !== undefined &&
        new Date().getTime() - this.#value.refreshTime.getTime() >
          this.cachingConfig.ttl)
    ) {
      this.#value = {
        value: await this.getFreshSecret(),
        refreshTime: new Date(),
      };
    }
    return this.#value.value;
  }
}

/**
 * A {@link Secret} parsed from  JSON.
 */
export class JsonSecret<T> implements Secret<T> {
  constructor(readonly secret: Secret<string>) {}

  public async getSecret(): Promise<T> {
    return JSON.parse(await this.secret.getSecret());
  }
}
