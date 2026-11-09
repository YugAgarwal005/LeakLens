// LeakLens — PolicyManager
// Resolves the effective domain policy for a given origin.
// Reads from StorageManager (local settings + managed policy overlay).
//
// Design principles:
// - Domain matching is exact hostname match only (no wildcard in v1).
// - Policy precedence: excluded > trusted > stricter > default.
// - The PolicyManager does NOT trust domain claims from the web page.
//   Callers must extract the origin from a verified browser API (e.g., tab URL).

import type { DomainPolicyType } from '../types/index.js';
import { StorageManager } from '../storage/StorageManager.js';

export class PolicyManager {
  private storageManager: StorageManager;

  constructor(storageManager?: StorageManager) {
    this.storageManager = storageManager ?? StorageManager.getInstance();
  }

  /**
   * Resolve the effective policy for a given origin.
   *
   * @param origin - The scheme+host origin string (e.g. "https://example.com").
   *                 This MUST come from a verified browser API, not from page content.
   * @returns The resolved domain policy type.
   */
  async resolve(origin: string): Promise<DomainPolicyType> {
    const hostname = this.extractHostname(origin);
    if (!hostname) return 'default';

    const schema = await this.storageManager.get();

    // If the extension is globally disabled, treat everything as excluded
    if (!schema.settings.enabled) {
      return 'excluded';
    }

    const { domainPolicies } = schema;

    // Precedence: excluded > trusted > stricter > default
    if (this.matchesDomain(hostname, domainPolicies.excluded)) {
      return 'excluded';
    }
    if (this.matchesDomain(hostname, domainPolicies.trusted)) {
      return 'trusted';
    }
    if (this.matchesDomain(hostname, domainPolicies.stricter)) {
      return 'stricter';
    }

    return 'default';
  }

  /**
   * Extract the hostname from an origin string.
   * Returns null for invalid or non-http/https origins.
   */
  private extractHostname(origin: string): string | null {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }
      return url.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Check if a hostname matches any entry in a domain list.
   * Matching is exact — no wildcard support in v1.
   * Comparison is case-insensitive (both sides are lowercased).
   */
  private matchesDomain(hostname: string, domains: readonly string[]): boolean {
    const lower = hostname.toLowerCase();
    return domains.some((d) => d.toLowerCase() === lower);
  }
}
