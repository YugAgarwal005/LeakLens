// LeakLens — Content Script (Milestone 5: Custom Rule Engine integrated)
// All 9 built-in detectors + user-defined CustomRuleDetectors are registered.

import { DetectorRegistry } from '../src/core/detection/DetectorRegistry';
import { DetectionEngine } from '../src/core/detection/DetectionEngine';
import { AadhaarDetector } from '../src/core/detection/detectors/AadhaarDetector';
import { CardDetector } from '../src/core/detection/detectors/CardDetector';
import { PANDetector } from '../src/core/detection/detectors/PANDetector';
import { UPIDetector } from '../src/core/detection/detectors/UPIDetector';
import { BankDetector } from '../src/core/detection/detectors/BankDetector';
import { APIKeyDetector } from '../src/core/detection/detectors/APIKeyDetector';
import { EmailDetector } from '../src/core/detection/detectors/EmailDetector';
import { PhoneDetector } from '../src/core/detection/detectors/PhoneDetector';
import { PasswordHeuristicDetector } from '../src/core/detection/detectors/PasswordHeuristicDetector';
import { tryCreateCustomDetector } from '../src/core/detection/detectors/CustomRuleDetector';
import { BadgeManager } from '../src/content/BadgeManager';
import { ModalController } from '../src/content/ModalController';
import { FieldObserver } from '../src/content/FieldObserver';
import type {
  DomainPolicyType,
  ExtensionSettings,
  CustomDetectorRule,
} from '../src/core/types/index';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',

  async main() {
    const pageOrigin = window.location.origin;

    // ─────────────────────────────────────────────────────
    // 1. Fetch settings, domain policy, and custom rules
    // ─────────────────────────────────────────────────────
    let policyType: DomainPolicyType = 'default';
    let settings: Partial<ExtensionSettings> = {};
    let customDetectorRules: CustomDetectorRule[] = [];

    try {
      const [policyResponse, settingsResponse] = await Promise.all([
        browser.runtime.sendMessage({
          type: 'LEAKLENS_GET_DOMAIN_POLICY',
          origin: pageOrigin,
        }),
        browser.runtime.sendMessage({ type: 'LEAKLENS_GET_SETTINGS' }),
      ]);

      if (policyResponse && typeof policyResponse === 'object' && 'policyType' in policyResponse) {
        policyType = (policyResponse as { policyType: DomainPolicyType }).policyType;
      }
      if (settingsResponse && typeof settingsResponse === 'object') {
        settings = settingsResponse as Partial<ExtensionSettings>;
      }

      // Custom rules live in storage, not the service worker (no size issue)
      const stored = await browser.storage.local.get('customDetectors') as {
        customDetectors?: CustomDetectorRule[];
      };
      customDetectorRules = stored.customDetectors ?? [];
    } catch {
      // Service worker starting — use defaults
    }

    // Guard: disabled or excluded
    if (settings.enabled === false) return;
    if (policyType === 'excluded') return;

    // ─────────────────────────────────────────────────────
    // 2. Build the registry
    // ─────────────────────────────────────────────────────
    const registry = new DetectorRegistry();
    const detEnabled = settings.detectorsEnabled ?? {};

    function reg<T extends Parameters<typeof registry.register>[0]>(
      detector: T,
      category: keyof typeof detEnabled,
    ) {
      if (detEnabled[category] !== false) {
        registry.register(detector);
      }
    }

    // Built-in detectors
    reg(new AadhaarDetector(), 'IDENTITY_GOV_IN');
    reg(new PANDetector(),    'IDENTITY_GOV_IN');
    reg(new CardDetector(),   'PAYMENT_CARD');
    reg(new UPIDetector(),    'PAYMENT_UPI');
    reg(new BankDetector(),   'PAYMENT_BANK');
    reg(new APIKeyDetector(), 'AUTH_SECRET');
    reg(new PasswordHeuristicDetector(), 'AUTH_SECRET');

    if (settings.badgeEnabled !== false) {
      reg(new EmailDetector(), 'PERSONAL_CONTACT');
      reg(new PhoneDetector(), 'PERSONAL_CONTACT');
    }

    // ─────────────────────────────────────────────────────
    // 3. Register user-defined custom rules
    //    Each enabled rule becomes its own Detector instance
    // ─────────────────────────────────────────────────────
    for (const rule of customDetectorRules) {
      if (!rule.enabled) continue;
      const detector = tryCreateCustomDetector(rule);
      if (detector) {
        registry.register(detector);
      }
    }

    // ─────────────────────────────────────────────────────
    // 4. Start pipeline
    // ─────────────────────────────────────────────────────
    const engine  = new DetectionEngine(registry);
    const badge   = new BadgeManager();
    const modal   = new ModalController();
    const observer = new FieldObserver(policyType, engine, badge, modal);

    observer.start();

    // ─────────────────────────────────────────────────────
    // 5. Hot-reload on settings changes
    // ─────────────────────────────────────────────────────
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      const settingsChanged   = 'settings' in changes;
      const rulesChanged      = 'customDetectors' in changes;

      if (settingsChanged) {
        const next = changes['settings']?.newValue as Partial<ExtensionSettings> | undefined;
        if (next?.enabled === false) {
          observer.stop();
          badge.removeAll();
        } else if (next?.enabled === true && !observer.isRunning) {
          observer.start();
        }
      }

      // If custom rules changed, we need a full restart to rebuild the registry.
      // Content scripts can't hot-reload themselves, so we post a message to
      // the user to reload the page (non-breaking — rules take effect on next
      // page load automatically).
      if (rulesChanged) {
        console.debug('[LeakLens] Custom rules updated — changes will apply on next page load.');
      }
    });
  },
});
