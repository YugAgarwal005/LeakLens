// LeakLens — ModalController
// Shows a blocking warning modal using an isolated Shadow DOM container.
//
// Key advantages of Shadow DOM over iframe:
// - Immune to host-page CSP (Content-Security-Policy: frame-src) which blocks
//   chrome-extension:// iframes on sites like ChatGPT, GitHub, and banks.
// - Completely isolated CSS so host page styles cannot leak into the warning dialog.
// - Zero loading latency or postMessage race conditions.
// - Accessible, keyboard-navigable, with close button and Escape key dismiss.

import type { RiskAssessment, DataCategory } from '../core/types/index.js';

const MODAL_Z_INDEX = 2_147_483_647; // Maximum browser z-index
const MODAL_TIMEOUT_MS = 5 * 60 * 1000; // 5-minute safety timeout

const CATEGORY_META: Record<DataCategory, { label: string; icon: string }> = {
  IDENTITY_GOV_IN: { label: 'Government ID (Aadhaar / PAN)', icon: '🪪' },
  PAYMENT_CARD:    { label: 'Payment Card',                  icon: '💳' },
  PAYMENT_UPI:     { label: 'UPI ID',                        icon: '📱' },
  PAYMENT_BANK:    { label: 'Bank Account / IFSC',           icon: '🏦' },
  PERSONAL_CONTACT:{ label: 'Contact Information',           icon: '📧' },
  AUTH_SECRET:     { label: 'Password / API Key Secret',     icon: '🔑' },
  CUSTOM:          { label: 'Custom Security Rule',          icon: '⚙️' },
};

export class ModalController {
  private hostElement: HTMLElement | null = null;
  private currentResolve: ((decision: 'proceed' | 'cancel') => void) | null = null;
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Show the warning modal and wait for the user's decision.
   * Resolves with 'proceed' if user accepted, or 'cancel' to stay on page.
   */
  async show(assessment: RiskAssessment): Promise<'proceed' | 'cancel'> {
    this.dismiss('cancel');

    return new Promise<'proceed' | 'cancel'>((resolve) => {
      this.currentResolve = resolve;
      this.renderModal(assessment);

      // Auto-cancel after timeout
      setTimeout(() => {
        if (this.currentResolve) {
          this.dismiss('cancel');
        }
      }, MODAL_TIMEOUT_MS);
    });
  }

  /** Dismiss the modal with a given decision */
  dismiss(decision: 'proceed' | 'cancel'): void {
    if (this.currentResolve) {
      this.currentResolve(decision);
      this.currentResolve = null;
    }
    this.cleanup();
  }

  // ---------------------------------------------------------------------------
  // Private — DOM rendering via Shadow Root
  // ---------------------------------------------------------------------------

  private renderModal(assessment: RiskAssessment): void {
    const host = document.createElement('div');
    host.id = 'leaklens-modal-host';
    host.style.position = 'fixed';
    host.style.zIndex = String(MODAL_Z_INDEX);
    host.style.inset = '0';
    host.style.pointerEvents = 'auto';

    const shadow = host.attachShadow({ mode: 'open' });
    this.hostElement = host;

    const riskColor =
      assessment.riskLevel === 'high'
        ? '#ef4444'
        : assessment.riskLevel === 'medium'
        ? '#f59e0b'
        : '#6366f1';

    const riskTitle =
      assessment.riskLevel === 'high'
        ? 'HIGH RISK — Sensitive Data Detected'
        : assessment.riskLevel === 'medium'
        ? 'MEDIUM RISK — Sensitive Data Detected'
        : 'LOW RISK — Potential Disclosure';

    const detectionsHtml = assessment.detections
      .map((d) => {
        const meta = CATEGORY_META[d.category] ?? { label: 'Sensitive Data', icon: '⚠' };
        return `
          <div class="detection-row">
            <div class="detection-label">
              <span class="detection-icon">${meta.icon}</span>
              <span>${meta.label}</span>
            </div>
            <div class="detection-preview">${d.maskedPreview}</div>
          </div>
        `;
      })
      .join('');

    shadow.innerHTML = `
      <style>
        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.18s ease-out;
        }

        .dialog {
          background: #0f0f18;
          border: 1px solid #2a2a40;
          border-top: 4px solid ${riskColor};
          border-radius: 16px;
          width: 100%;
          max-width: 440px;
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.85);
          overflow: hidden;
          position: relative;
          animation: slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .header {
          padding: 20px 20px 14px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          border-bottom: 1px solid #1f1f30;
          background: linear-gradient(180deg, ${riskColor}14 0%, transparent 100%);
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-icon {
          font-size: 26px;
          line-height: 1;
        }

        .title {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.25;
        }

        .risk-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: ${riskColor};
          margin-top: 4px;
        }

        .close-btn {
          background: #1a1a28;
          border: 1px solid #2e2e45;
          color: #9ca3af;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.15s;
          line-height: 1;
        }

        .close-btn:hover {
          background: #2a2a3e;
          color: #ffffff;
        }

        .body {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .destination-bar {
          background: #151522;
          border: 1px solid #242438;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #9ca3af;
        }

        .destination-bar strong {
          color: #e5e7eb;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .detections-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #6b7280;
          margin-top: 4px;
        }

        .detections-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detection-row {
          background: #151522;
          border: 1px solid #242438;
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .detection-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #f3f4f6;
        }

        .detection-icon {
          font-size: 16px;
        }

        .detection-preview {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          color: #c7d2fe;
          background: #312e8133;
          border: 1px solid #4338ca55;
          padding: 3px 8px;
          border-radius: 6px;
          letter-spacing: 0.5px;
        }

        .privacy-guarantee {
          font-size: 11px;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding-top: 2px;
        }

        .footer {
          padding: 14px 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-top: 1px solid #1f1f30;
          background: #12121e;
        }

        .btn-cancel {
          background: #7c6af7;
          color: #ffffff;
          border: none;
          padding: 11px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: 0 4px 16px rgba(124, 106, 247, 0.35);
        }

        .btn-cancel:hover {
          background: #9081f9;
          transform: translateY(-1px);
        }

        .btn-proceed {
          background: transparent;
          color: #9ca3af;
          border: 1px solid #2e2e45;
          padding: 9px 16px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-proceed:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.3);
        }
      </style>

      <div class="backdrop" id="leaklens-backdrop">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="leaklens-title">
          <div class="header">
            <div class="header-content">
              <span class="header-icon">🛡</span>
              <div>
                <div class="title" id="leaklens-title">Sensitive Data Detected</div>
                <div class="risk-badge">${riskTitle}</div>
              </div>
            </div>
            <button class="close-btn" id="leaklens-close" aria-label="Close">×</button>
          </div>

          <div class="body">
            <div class="destination-bar">
              <span>Submitting to:</span>
              <strong>${assessment.destinationOrigin || window.location.origin}</strong>
            </div>

            <div class="detections-title">Detected Items</div>
            <div class="detections-list">
              ${detectionsHtml}
            </div>

            <div class="privacy-guarantee">
              <span>🔒 All detection is 100% local. Your data was not sent anywhere.</span>
            </div>
          </div>

          <div class="footer">
            <button class="btn-cancel" id="leaklens-btn-cancel">← Go back and review</button>
            <button class="btn-proceed" id="leaklens-btn-proceed">I understand, submit anyway</button>
          </div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(host);

    // Event listeners
    const cancelBtn = shadow.getElementById('leaklens-btn-cancel');
    const proceedBtn = shadow.getElementById('leaklens-btn-proceed');
    const closeBtn = shadow.getElementById('leaklens-close');
    const backdrop = shadow.getElementById('leaklens-backdrop');

    cancelBtn?.addEventListener('click', () => this.dismiss('cancel'));
    closeBtn?.addEventListener('click', () => this.dismiss('cancel'));
    proceedBtn?.addEventListener('click', () => this.dismiss('proceed'));

    // Clicking backdrop outside the dialog dismisses
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.dismiss('cancel');
      }
    });

    // Auto-focus the safe "Go back" button
    cancelBtn?.focus();

    // Escape key dismisses modal
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.dismiss('cancel');
      }
    };
    window.addEventListener('keydown', this.keydownListener, { capture: true });
  }

  private cleanup(): void {
    if (this.keydownListener) {
      window.removeEventListener('keydown', this.keydownListener, { capture: true });
      this.keydownListener = null;
    }
    if (this.hostElement) {
      this.hostElement.remove();
      this.hostElement = null;
    }
  }
}
