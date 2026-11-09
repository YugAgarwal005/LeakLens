// LeakLens — StorageManager
// Abstraction over browser.storage.local and browser.storage.managed.
//
// Rules enforced by this module:
// - Raw field values (RawFieldValue) are NEVER accepted as arguments.
// - All data written is validated through StorageSchemaValidator before persistence.
// - browser.storage.managed (enterprise) values take precedence over local values.
// - Schema migrations are applied sequentially and safely.

import type { StorageSchema, ExtensionSettings, DomainPoliciesConfig, CustomDetectorRule } from '../types/index.js';
import {
  StorageSchemaValidator,
  DEFAULT_STORAGE,
} from './schema.js';

// ---------------------------------------------------------------------------
// Migration definitions
// ---------------------------------------------------------------------------

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Add new migrations here as {fromVersion, migrate} entries. */
const MIGRATIONS: { fromVersion: number; migrate: MigrationFn }[] = [
  // Future: { fromVersion: 1, migrate: (data) => ({ ...data, schemaVersion: 2, ... }) },
];

function applyMigrations(raw: Record<string, unknown>): Record<string, unknown> {
  let current = { ...raw };
  const currentVersion = typeof current['schemaVersion'] === 'number' ? current['schemaVersion'] : 0;

  for (const migration of MIGRATIONS) {
    if (migration.fromVersion === currentVersion) {
      current = migration.migrate(current);
    }
  }

  return current;
}

// ---------------------------------------------------------------------------
// StorageManager
// ---------------------------------------------------------------------------

export class StorageManager {
  private static instance: StorageManager | null = null;
  private cachedSchema: StorageSchema | null = null;

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /** Load the full storage schema, applying migrations if needed.
   *  Managed policy values overlay local values where present.
   */
  async load(): Promise<StorageSchema> {
    // Load local storage
    const localRaw = await browser.storage.local.get(null) as Record<string, unknown>;

    // Load managed storage (enterprise policy) — fail gracefully if unavailable
    let managedRaw: Record<string, unknown> = {};
    try {
      managedRaw = await browser.storage.managed.get(null) as Record<string, unknown>;
    } catch {
      // browser.storage.managed may not be available in all browsers/environments
      managedRaw = {};
    }

    // Apply migrations to local data
    const migratedLocal = localRaw['schemaVersion'] !== undefined
      ? applyMigrations(localRaw)
      : {};

    // Merge: managed values take precedence over local values
    const merged = deepMerge(DEFAULT_STORAGE as unknown as Record<string, unknown>, migratedLocal, managedRaw);

    // Validate the merged result
    const parseResult = StorageSchemaValidator.safeParse(merged);
    if (!parseResult.success) {
      // Invalid storage — log the issue (no sensitive content in storage, so safe to log error)
      console.warn('[LeakLens] Storage validation failed, using defaults:', parseResult.error.message);
      await this.reset();
      this.cachedSchema = DEFAULT_STORAGE;
      return DEFAULT_STORAGE;
    }

    this.cachedSchema = parseResult.data as StorageSchema;
    return this.cachedSchema;
  }

  /** Get the cached schema (loads if not yet loaded) */
  async get(): Promise<StorageSchema> {
    if (!this.cachedSchema) {
      return this.load();
    }
    return this.cachedSchema;
  }

  /** Update extension settings */
  async updateSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.get();
    const updated: StorageSchema = {
      ...current,
      settings: { ...current.settings, ...settings },
    };
    await this.save(updated);
  }

  /** Update domain policies */
  async updateDomainPolicies(policies: Partial<DomainPoliciesConfig>): Promise<void> {
    const current = await this.get();
    const updated: StorageSchema = {
      ...current,
      domainPolicies: { ...current.domainPolicies, ...policies },
    };
    await this.save(updated);
  }

  /** Replace all custom detector rules (validated on import) */
  async setCustomDetectors(rules: readonly CustomDetectorRule[]): Promise<void> {
    const current = await this.get();
    const updated: StorageSchema = {
      ...current,
      customDetectors: rules,
    };
    await this.save(updated);
  }

  /** Reset storage to defaults */
  async reset(): Promise<void> {
    await browser.storage.local.clear();
    await browser.storage.local.set(DEFAULT_STORAGE as unknown as Record<string, unknown>);
    this.cachedSchema = DEFAULT_STORAGE;
  }

  /** Invalidate the in-memory cache (call after storage.onChanged fires) */
  invalidateCache(): void {
    this.cachedSchema = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async save(schema: StorageSchema): Promise<void> {
    // Re-validate before saving
    const parseResult = StorageSchemaValidator.safeParse(schema);
    if (!parseResult.success) {
      throw new Error(`[LeakLens] Attempted to save invalid storage schema: ${parseResult.error.message}`);
    }
    await browser.storage.local.set(parseResult.data as unknown as Record<string, unknown>);
    this.cachedSchema = parseResult.data as StorageSchema;
  }
}

// ---------------------------------------------------------------------------
// Deep merge utility (only merges plain objects, not arrays)
// ---------------------------------------------------------------------------

function deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const obj of objects) {
    for (const [key, value] of Object.entries(obj)) {
      const existing = result[key];
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof existing === 'object' &&
        existing !== null &&
        !Array.isArray(existing)
      ) {
        result[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}
