/**
 * Secrets Guard - Vault-ready abstraction for secrets.
 * Interface: SecretProvider (get, set, rotate)
 */
export interface SecretProvider {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  rotate?(key: string): Promise<string | undefined>;
}

/**
 * Environment variable secret provider.
 * Reads from process.env. set/rotate are no-ops.
 */
export class EnvSecretProvider implements SecretProvider {
  private readonly prefix: string;
  private readonly env: Record<string, string | undefined>;

  constructor(options?: { prefix?: string; env?: Record<string, string | undefined> }) {
    this.prefix = options?.prefix ?? "BOT_";
    this.env = options?.env ?? process.env;
  }

  async get(key: string): Promise<string | undefined> {
    const envKey = this.prefix + key.replace(/-/g, "_").toUpperCase();
    return this.env[envKey];
  }

  async set(_key: string, _value: string): Promise<void> {
    // Env provider is read-only
  }

  async rotate(_key: string): Promise<string | undefined> {
    return undefined;
  }
}

/**
 * HashiCorp Vault provider stub.
 * Placeholder for future Vault integration.
 */
export class HashiCorpVaultProvider implements SecretProvider {
  private readonly vaultAddr: string;
  private readonly mountPath: string;
  private cache: Map<string, string> = new Map();

  constructor(options: { vaultAddr: string; mountPath?: string }) {
    this.vaultAddr = options.vaultAddr;
    this.mountPath = options.mountPath ?? "secret";
  }

  async get(key: string): Promise<string | undefined> {
    if (this.cache.has(key)) return this.cache.get(key);
    // Stub: in production would call Vault HTTP API
    // const resp = await fetch(`${this.vaultAddr}/v1/${this.mountPath}/data/${key}`);
    return undefined;
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    // Stub: in production would call Vault HTTP API
  }

  async rotate(key: string): Promise<string | undefined> {
    // Stub: would trigger Vault rotation
    return this.get(key);
  }
}
