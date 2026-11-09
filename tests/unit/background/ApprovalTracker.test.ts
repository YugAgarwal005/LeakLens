// LeakLens — ApprovalTracker Unit Tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApprovalTracker } from '../../../src/background/ApprovalTracker.js';

describe('ApprovalTracker', () => {
  let tracker: ApprovalTracker;

  beforeEach(() => {
    tracker = new ApprovalTracker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Basic approval
  // -------------------------------------------------------------------------

  it('returns false for an unknown approval', () => {
    expect(tracker.isApproved(1, 'action-abc')).toBe(false);
  });

  it('returns true immediately after recording an approval', () => {
    tracker.record(1, 'action-abc');
    expect(tracker.isApproved(1, 'action-abc')).toBe(true);
  });

  it('does not grant approval for a different actionId', () => {
    tracker.record(1, 'action-abc');
    expect(tracker.isApproved(1, 'action-xyz')).toBe(false);
  });

  it('does not grant approval for a different tabId', () => {
    tracker.record(1, 'action-abc');
    expect(tracker.isApproved(2, 'action-abc')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Expiry (5 minutes = 300,000ms)
  // -------------------------------------------------------------------------

  it('returns false after the approval has expired (5 minutes + 1ms)', () => {
    tracker.record(1, 'action-abc');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(tracker.isApproved(1, 'action-abc')).toBe(false);
  });

  it('returns true just before expiry (4 minutes 59 seconds)', () => {
    tracker.record(1, 'action-abc');
    vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);
    expect(tracker.isApproved(1, 'action-abc')).toBe(true);
  });

  it('cleans up the expired record after checking it', () => {
    tracker.record(1, 'action-abc');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    tracker.isApproved(1, 'action-abc'); // Should clean up
    // Subsequent check should also be false (not a ghost entry)
    expect(tracker.isApproved(1, 'action-abc')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Tab invalidation
  // -------------------------------------------------------------------------

  it('invalidates all approvals for a tab on navigation', () => {
    tracker.record(1, 'action-abc');
    tracker.record(1, 'action-xyz');
    tracker.invalidateTab(1);
    expect(tracker.isApproved(1, 'action-abc')).toBe(false);
    expect(tracker.isApproved(1, 'action-xyz')).toBe(false);
  });

  it('does not invalidate approvals for other tabs', () => {
    tracker.record(1, 'action-abc');
    tracker.record(2, 'action-abc');
    tracker.invalidateTab(1);
    expect(tracker.isApproved(2, 'action-abc')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Pruning
  // -------------------------------------------------------------------------

  it('pruneExpired removes only expired records', () => {
    tracker.record(1, 'action-abc');
    vi.advanceTimersByTime(2 * 60 * 1000); // 2 min
    tracker.record(2, 'action-xyz'); // Fresh approval
    vi.advanceTimersByTime(3 * 60 * 1000 + 1); // Total: 5min1ms for first

    tracker.pruneExpired();

    expect(tracker.isApproved(1, 'action-abc')).toBe(false); // expired and pruned
    expect(tracker.isApproved(2, 'action-xyz')).toBe(true);  // still valid (2min old)
  });
});
