// LeakLens — SessionCounter
// Tracks per-category warning counts for the current browser session.
//
// Design:
// - All state is in-memory ONLY. Nothing is written to chrome.storage.
// - Counts are by category only — no URLs, no field content, no timestamps per event.
// - The counter resets when the service worker terminates (which is expected behavior).
// - This is used solely for the popup's "N warnings this session" display.

import type { DataCategory } from '../core/types/index.js';

export class SessionCounter {
  private counts = new Map<DataCategory, number>();
  private total = 0;

  /**
   * Increment the warning count for a given category.
   * Only call this with a DataCategory — never pass field values.
   */
  increment(category: DataCategory): void {
    const current = this.counts.get(category) ?? 0;
    this.counts.set(category, current + 1);
    this.total++;
  }

  /** Get the count for a specific category */
  getCount(category: DataCategory): number {
    return this.counts.get(category) ?? 0;
  }

  /** Get all category counts as a plain object */
  getCounts(): Partial<Record<DataCategory, number>> {
    return Object.fromEntries(this.counts.entries()) as Partial<Record<DataCategory, number>>;
  }

  /** Get the total warning count across all categories */
  getTotal(): number {
    return this.total;
  }

  /** Reset all counts (not normally called — the SW lifecycle handles this) */
  reset(): void {
    this.counts.clear();
    this.total = 0;
  }
}
