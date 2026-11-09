// LeakLens — ApprovalTracker
// Manages per-tab, per-action "Take Risk" approvals.
//
// Security properties:
// - Approvals are scoped to a specific {tabId, actionId} pair.
// - Approvals expire after APPROVAL_TTL_MS milliseconds.
// - Approvals are invalidated when a tab navigates.
// - No raw field values or page content are stored here.
// - This entire store lives in memory only — it is never persisted.

import type { ApprovalRecord } from '../core/types/index.js';

/** Approval time-to-live: 5 minutes */
const APPROVAL_TTL_MS = 5 * 60 * 1000;

export class ApprovalTracker {
  /** In-memory store only. Never persisted to chrome.storage. */
  private approvals = new Map<string, ApprovalRecord>();

  /**
   * Record a new approval for a {tabId, actionId} pair.
   *
   * @param tabId - The browser tab ID.
   * @param actionId - A hash derived from {formActionOrigin, sortedFieldNames}.
   *                   Must NOT contain raw field values.
   */
  record(tabId: number, actionId: string): void {
    const now = Date.now();
    const record: ApprovalRecord = {
      tabId,
      actionId,
      grantedAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
    };
    this.approvals.set(this.key(tabId, actionId), record);
  }

  /**
   * Check if a valid, non-expired approval exists for the given pair.
   *
   * @returns true only if an approval exists AND has not expired.
   */
  isApproved(tabId: number, actionId: string): boolean {
    const record = this.approvals.get(this.key(tabId, actionId));
    if (!record) return false;

    if (Date.now() > record.expiresAt) {
      this.approvals.delete(this.key(tabId, actionId));
      return false;
    }

    return true;
  }

  /**
   * Invalidate all approvals for a given tab.
   * Called when a tab navigates (chrome.tabs.onUpdated with loading status).
   */
  invalidateTab(tabId: number): void {
    for (const [key, record] of this.approvals.entries()) {
      if (record.tabId === tabId) {
        this.approvals.delete(key);
      }
    }
  }

  /** Remove all expired approvals. Call periodically to prevent memory growth. */
  pruneExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.approvals.entries()) {
      if (now > record.expiresAt) {
        this.approvals.delete(key);
      }
    }
  }

  private key(tabId: number, actionId: string): string {
    return `${tabId}:${actionId}`;
  }
}
