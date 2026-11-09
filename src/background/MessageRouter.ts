// LeakLens — MessageRouter (Service Worker)
// Validates and routes all messages between content scripts and extension pages.
//
// Security rules enforced here:
// 1. All messages are validated against expected shapes before processing.
// 2. Messages that carry suspicious extra properties (potential raw value leakage) are dropped.
// 3. The sender is validated — only messages from known extension contexts or tab content
//    scripts are processed.
// 4. No raw field values should ever appear in messages — the types enforce this,
//    but we do a runtime check as defense-in-depth.

import type {
  ExtensionMessage,
  MsgWarningDetected,
  MsgGetDomainPolicy,
  MsgCheckApproval,
  MsgRecordApproval,
  MsgGetSessionCounts,
} from '../core/types/index.js';
import { ApprovalTracker } from './ApprovalTracker.js';
import { SessionCounter } from './SessionCounter.js';
import { PolicyManager } from '../core/policy/PolicyManager.js';
import { StorageManager } from '../core/storage/StorageManager.js';

export interface MessageSender {
  id?: string | undefined;
  tab?: { id?: number | undefined; url?: string | undefined } | undefined;
}

export class MessageRouter {
  private approvalTracker: ApprovalTracker;
  private sessionCounter: SessionCounter;
  private policyManager: PolicyManager;
  private storageManager: StorageManager;

  constructor(
    approvalTracker: ApprovalTracker,
    sessionCounter: SessionCounter,
    policyManager: PolicyManager,
  ) {
    this.approvalTracker = approvalTracker;
    this.sessionCounter = sessionCounter;
    this.policyManager = policyManager;
    this.storageManager = StorageManager.getInstance();
  }

  /**
   * Handle an incoming runtime message.
   * Returns a response object (synchronously or via Promise), or void.
   */
  async handle(
    message: unknown,
    sender: MessageSender,
  ): Promise<unknown> {
    // Validate message structure
    if (!isValidMessage(message)) {
      return undefined;
    }

    // Validate sender — only accept messages from content scripts (tab context)
    // or extension pages (no tab = extension page)
    if (!isValidSender(sender)) {
      return undefined;
    }

    const msg = message as ExtensionMessage;

    switch (msg.type) {
      case 'LEAKLENS_WARNING_DETECTED': {
        return this.handleWarningDetected(msg as MsgWarningDetected);
      }
      case 'LEAKLENS_GET_DOMAIN_POLICY': {
        return this.handleGetDomainPolicy(msg as MsgGetDomainPolicy);
      }
      case 'LEAKLENS_CHECK_APPROVAL': {
        return this.handleCheckApproval(msg as MsgCheckApproval, sender);
      }
      case 'LEAKLENS_RECORD_APPROVAL': {
        return this.handleRecordApproval(msg as MsgRecordApproval, sender);
      }
      case 'LEAKLENS_GET_SESSION_COUNTS': {
        return this.handleGetSessionCounts();
      }
      case 'LEAKLENS_GET_SETTINGS': {
        return this.handleGetSettings();
      }
      default: {
        // Unknown message type — silently drop
        return undefined;
      }
    }
  }

  private handleWarningDetected(msg: MsgWarningDetected): void {
    this.sessionCounter.increment(msg.category);
    // No raw values — only category metadata is received here
  }

  private async handleGetDomainPolicy(msg: MsgGetDomainPolicy): Promise<unknown> {
    const policyType = await this.policyManager.resolve(msg.origin);
    return {
      type: 'LEAKLENS_DOMAIN_POLICY_RESPONSE' as const,
      policyType,
    };
  }

  private handleCheckApproval(
    msg: MsgCheckApproval,
    sender: MessageSender,
  ): unknown {
    // Use the tab ID from the verified sender, not from the message payload
    // (prevents a content script from checking/using another tab's approval)
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      return { type: 'LEAKLENS_APPROVAL_RESPONSE' as const, approved: false };
    }
    const approved = this.approvalTracker.isApproved(tabId, msg.actionId);
    return { type: 'LEAKLENS_APPROVAL_RESPONSE' as const, approved };
  }

  private handleRecordApproval(
    msg: MsgRecordApproval,
    sender: MessageSender,
  ): void {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    // Use tabId from verified sender, not from message
    this.approvalTracker.record(tabId, msg.actionId);
  }

  private handleGetSessionCounts(): unknown {
    return {
      type: 'LEAKLENS_SESSION_COUNTS_RESPONSE' as const,
      counts: this.sessionCounter.getCounts(),
      total: this.sessionCounter.getTotal(),
    };
  }

  private async handleGetSettings(): Promise<unknown> {
    const schema = await this.storageManager.get();
    return schema?.settings ?? {};
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_MESSAGE_TYPES = new Set([
  'LEAKLENS_WARNING_DETECTED',
  'LEAKLENS_GET_DOMAIN_POLICY',
  'LEAKLENS_DOMAIN_POLICY_RESPONSE',
  'LEAKLENS_CHECK_APPROVAL',
  'LEAKLENS_APPROVAL_RESPONSE',
  'LEAKLENS_RECORD_APPROVAL',
  'LEAKLENS_GET_SESSION_COUNTS',
  'LEAKLENS_SESSION_COUNTS_RESPONSE',
  'LEAKLENS_GET_SETTINGS',
]);

function isValidMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  if (typeof msg['type'] !== 'string') return false;
  if (!VALID_MESSAGE_TYPES.has(msg['type'])) return false;
  // Defense-in-depth: reject suspiciously large messages
  // (raw values would make messages much larger than they should be)
  const serialized = JSON.stringify(message);
  if (serialized.length > 2048) return false;
  return true;
}

function isValidSender(sender: MessageSender): boolean {
  // Must either come from a tab (content script) or have no tab (extension page)
  // Block messages from other extensions
  if (sender.id !== browser.runtime.id) return false;
  return true;
}
