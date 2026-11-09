// LeakLens — Background Service Worker
// MV3 service worker initialised using WXT's defineBackground helper.
//
// All event listeners MUST be registered synchronously at the top level.
// State must not be stored in module-level variables that survive restarts
// — use chrome.storage.session for ephemeral cross-restart state.

import { StorageManager } from '../src/core/storage/StorageManager';
import { PolicyManager } from '../src/core/policy/PolicyManager';
import { ApprovalTracker } from '../src/background/ApprovalTracker';
import { SessionCounter } from '../src/background/SessionCounter';
import { MessageRouter } from '../src/background/MessageRouter';

export default defineBackground(() => {
  // ---------------------------------------------------------------------------
  // Initialise singletons (re-created on each service worker startup)
  // None of these hold raw field values.
  // ---------------------------------------------------------------------------
  const storageManager = StorageManager.getInstance();
  const policyManager = new PolicyManager(storageManager);
  const approvalTracker = new ApprovalTracker();
  const sessionCounter = new SessionCounter();
  const messageRouter = new MessageRouter(approvalTracker, sessionCounter, policyManager);

  // ---------------------------------------------------------------------------
  // Extension lifecycle
  // ---------------------------------------------------------------------------
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      // Fresh install — open the onboarding page
      browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') }).catch(() => {
        // Non-critical if tab creation fails
      });
    }

    // Auto-inject content scripts into existing http/https tabs so users don't have to reload them
    browser.tabs.query({ url: ['http://*/*', 'https://*/*'] }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          browser.scripting
            .executeScript({
              target: { tabId: tab.id, allFrames: true },
              files: ['/content-scripts/content.js'],
            })
            .catch(() => {});
        }
      }
    }).catch(() => {});
  });

  // ---------------------------------------------------------------------------
  // Message routing — validates and routes all inter-component messages
  // ---------------------------------------------------------------------------
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    messageRouter
      .handle(message, sender)
      .then((response) => {
        if (response !== undefined) {
          sendResponse(response);
        }
      })
      .catch(() => {
        // Errors in message handling must not surface raw content
        sendResponse(undefined);
      });

    // Return true to signal async response
    return true;
  });

  // ---------------------------------------------------------------------------
  // Storage change notifications — invalidate the StorageManager cache
  // ---------------------------------------------------------------------------
  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local' || area === 'managed') {
      storageManager.invalidateCache();
    }
  });

  // ---------------------------------------------------------------------------
  // Tab navigation — invalidate per-tab "Take Risk" approvals
  // ---------------------------------------------------------------------------
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      approvalTracker.invalidateTab(tabId);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    approvalTracker.invalidateTab(tabId);
  });

  // ---------------------------------------------------------------------------
  // Periodic cleanup — remove expired approvals every 10 minutes
  // ---------------------------------------------------------------------------
  browser.alarms.create('leaklens-prune-approvals', { periodInMinutes: 10 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'leaklens-prune-approvals') {
      approvalTracker.pruneExpired();
    }
  });
});
