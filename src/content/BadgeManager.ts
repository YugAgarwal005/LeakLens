// LeakLens — BadgeManager
// Injects and manages a floating warning badge on fields with detected sensitive data.
//
// Key design decisions:
// - Uses a top-level viewport container attached to document.documentElement.
//   This ensures the badge is NEVER clipped by parent containers with `overflow: hidden`,
//   `display: flex`, or fixed heights (critical for Google Search, Amazon, etc.).
// - Positions dynamically via getBoundingClientRect() relative to viewport.
// - Automatically updates coordinates on window scroll, resize, and user input.
// - High z-index (2,147,483,646) and high-contrast solid colors ensure visibility on
//   both dark and light themes.

import type { RiskAssessment } from '../core/types/index.js';

const BADGE_CLASS = 'leaklens-badge';
const BADGE_CONTAINER_ID = 'leaklens-badge-container';
const BADGE_ID_PREFIX = 'leaklens-badge-';

let badgeCounter = 0;

const BADGE_STYLES = `
#leaklens-badge-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
  overflow: visible;
}
.leaklens-badge {
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  line-height: 1.4;
  pointer-events: auto;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s ease;
  user-select: none;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
.leaklens-badge.visible {
  opacity: 1;
}
.leaklens-badge[data-risk="low"] {
  background: #4338ca !important;
  color: #ffffff !important;
  border: 1px solid #6366f1 !important;
}
.leaklens-badge[data-risk="medium"] {
  background: #b45309 !important;
  color: #ffffff !important;
  border: 1px solid #f59e0b !important;
}
.leaklens-badge[data-risk="high"] {
  background: #b91c1c !important;
  color: #ffffff !important;
  border: 1px solid #ef4444 !important;
}
`;

export class BadgeManager {
  private fieldBadges = new WeakMap<Element, HTMLElement>();
  private activeFields = new Set<Element>();
  private container: HTMLElement | null = null;
  private styleInjected = false;
  private scrollListenerAttached = false;

  constructor() {
    this.injectStyles();
    this.attachGlobalRepositionListeners();
  }

  /**
   * Update (or remove) the badge for a given field based on an assessment.
   */
  update(field: Element, assessment: RiskAssessment): void {
    if (!assessment.shouldShowBadge) {
      this.removeBadge(field);
      return;
    }
    this.showBadge(field, assessment);
  }

  /** Remove all badges (called when extension is disabled mid-session). */
  removeAll(): void {
    this.activeFields.forEach((field) => this.removeBadge(field));
    this.activeFields.clear();
    this.container?.remove();
    this.container = null;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private getContainer(): HTMLElement {
    if (this.container && this.container.isConnected) {
      return this.container;
    }
    let el = document.getElementById(BADGE_CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BADGE_CONTAINER_ID;
      (document.body || document.documentElement).appendChild(el);
    }
    this.container = el;
    return el;
  }

  private showBadge(field: Element, assessment: RiskAssessment): void {
    let badge = this.fieldBadges.get(field);

    if (!badge || !badge.isConnected) {
      badge = this.createBadge();
      this.fieldBadges.set(field, badge);
      this.activeFields.add(field);
      this.getContainer().appendChild(badge);
    }

    const riskLevel = assessment.riskLevel === 'none' ? 'medium' : assessment.riskLevel;
    badge.setAttribute('data-risk', riskLevel);
    badge.textContent = this.badgeLabel(assessment);

    this.positionBadge(field, badge);
    badge.classList.add('visible');
  }

  private removeBadge(field: Element): void {
    const badge = this.fieldBadges.get(field);
    if (badge) {
      badge.classList.remove('visible');
      setTimeout(() => badge?.remove(), 200);
      this.fieldBadges.delete(field);
      this.activeFields.delete(field);
    }
  }

  private positionBadge(field: Element, badge: HTMLElement): void {
    if (!field.isConnected) {
      this.removeBadge(field);
      return;
    }

    const rect = field.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      badge.style.display = 'none';
      return;
    }

    badge.style.display = 'inline-flex';
    const isMultiline = rect.height > 50;

    if (isMultiline) {
      badge.style.top = `${rect.top + 8}px`;
      badge.style.left = `${rect.right - 10}px`;
      badge.style.transform = 'translate(-100%, 0)';
    } else {
      badge.style.top = `${rect.top + rect.height / 2}px`;
      badge.style.left = `${rect.right - 10}px`;
      badge.style.transform = 'translate(-100%, -50%)';
    }
  }

  private createBadge(): HTMLElement {
    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.id = `${BADGE_ID_PREFIX}${badgeCounter++}`;
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    return badge;
  }

  private badgeLabel(assessment: RiskAssessment): string {
    const first = assessment.detections[0];
    if (first) {
      switch (first.category) {
        case 'IDENTITY_GOV_IN':
          return first.detectorId === 'aadhaar-v1' ? '🛡 ⚠ Aadhaar' : '🛡 ⚠ PAN Card';
        case 'PAYMENT_CARD':
          return '🛡 ⚠ Payment Card';
        case 'PAYMENT_UPI':
          return '🛡 ⚠ UPI ID';
        case 'PAYMENT_BANK':
          return '🛡 ⚠ Bank Account';
        case 'AUTH_SECRET':
          return '🛡 ⚠ API Secret';
        case 'PERSONAL_CONTACT':
          return '🛡 • Contact Info';
        case 'CUSTOM':
          return '🛡 ⚠ Sensitive Rule';
      }
    }
    return '🛡 ⚠ Sensitive Data';
  }

  private attachGlobalRepositionListeners(): void {
    if (this.scrollListenerAttached || typeof window === 'undefined') return;

    const repositionAll = () => {
      this.activeFields.forEach((field) => {
        const badge = this.fieldBadges.get(field);
        if (badge && badge.isConnected) {
          this.positionBadge(field, badge);
        }
      });
    };

    window.addEventListener('scroll', repositionAll, { passive: true, capture: true });
    window.addEventListener('resize', repositionAll, { passive: true });
    this.scrollListenerAttached = true;
  }

  private injectStyles(): void {
    if (this.styleInjected || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.setAttribute('data-leaklens', 'badge-styles');
    style.textContent = BADGE_STYLES;
    (document.head ?? document.documentElement).appendChild(style);
    this.styleInjected = true;
  }
}
