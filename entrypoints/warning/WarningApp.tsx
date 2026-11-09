import React, { useEffect, useState, useCallback } from 'react';
import type { WarningPayload, DataCategory, RiskLevel } from '../../src/core/types/index';
import './WarningApp.css';

// ---------------------------------------------------------------------------
// Category display
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<DataCategory, { label: string; icon: string }> = {
  IDENTITY_GOV_IN: { label: 'Government ID',    icon: '🪪' },
  PAYMENT_CARD:    { label: 'Payment Card',      icon: '💳' },
  PAYMENT_UPI:     { label: 'UPI ID',            icon: '📱' },
  PAYMENT_BANK:    { label: 'Bank Details',      icon: '🏦' },
  PERSONAL_CONTACT:{ label: 'Contact Info',      icon: '📧' },
  AUTH_SECRET:     { label: 'Password / Secret', icon: '🔑' },
  CUSTOM:          { label: 'Custom Rule',        icon: '⚙️' },
};

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; icon: string }> = {
  none:   { label: 'Info',     color: '#8584ff', bg: 'rgba(83,82,237,0.08)',  icon: 'ℹ' },
  low:    { label: 'Low Risk', color: '#8584ff', bg: 'rgba(83,82,237,0.08)',  icon: '⚠' },
  medium: { label: 'Medium Risk', color: '#ffa502', bg: 'rgba(255,165,2,0.08)', icon: '⚠' },
  high:   { label: 'High Risk',   color: '#ff4757', bg: 'rgba(255,71,87,0.08)', icon: '🛑' },
};

// ---------------------------------------------------------------------------
// WarningApp Component
// ---------------------------------------------------------------------------

export default function WarningApp() {
  const [payload, setPayload] = useState<WarningPayload | null>(null);
  const [decided, setDecided] = useState(false);

  // Listen for the payload from the content script
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Only accept messages from the parent (content script origin)
      const data = event.data as Partial<WarningPayload>;
      if (data?.type === 'LEAKLENS_SHOW_WARNING') {
        setPayload(data as WarningPayload);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sendDecision = useCallback(
    (decision: 'proceed' | 'cancel') => {
      if (!payload || decided) return;
      setDecided(true);
      window.parent.postMessage(
        { type: 'LEAKLENS_WARNING_DECISION', decision, nonce: payload.nonce },
        '*',
      );
    },
    [payload, decided],
  );

  // ---- Loading state ----
  if (!payload) {
    return (
      <div className="warning-loading">
        <div className="warning-spinner" />
      </div>
    );
  }

  const { riskLevel, categories, maskedPreviews, destinationOrigin } = payload;
  const riskCfg = RISK_CONFIG[riskLevel] ?? RISK_CONFIG.medium;

  // ---- Main UI ----
  return (
    <div className="warning-root">
      {/* Header bar */}
      <div className="warning-header" style={{ background: riskCfg.bg, borderColor: riskCfg.color + '44' }}>
        <span className="warning-header-icon" aria-hidden="true">{riskCfg.icon}</span>
        <div className="warning-header-text">
          <p className="warning-title">Sensitive Data Detected</p>
          <p className="warning-subtitle" style={{ color: riskCfg.color }}>
            {riskCfg.label}
          </p>
        </div>
        <img
          src={browser.runtime.getURL('/icons/icon-48.png')}
          alt="LeakLens"
          className="warning-logo"
        />
      </div>

      {/* Body */}
      <div className="warning-body">
        {/* Destination */}
        <div className="warning-destination">
          <span className="warning-dest-label">Submitting to:</span>
          <span className="warning-dest-origin">{destinationOrigin}</span>
        </div>

        {/* Detected items */}
        <div className="warning-detections">
          <p className="warning-detections-title">What was detected:</p>
          <ul className="warning-detection-list" role="list">
            {categories.map((cat, i) => {
              const cfg = CATEGORY_LABELS[cat];
              const preview = maskedPreviews[i];
              return (
                <li key={`${cat}-${i}`} className="warning-detection-item">
                  <span className="warning-det-icon" aria-hidden="true">
                    {cfg?.icon ?? '⚠'}
                  </span>
                  <div className="warning-det-content">
                    <span className="warning-det-label">{cfg?.label ?? cat}</span>
                    {preview && (
                      <code className="warning-det-preview" aria-label="Masked preview">
                        {preview}
                      </code>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Privacy note */}
        <p className="warning-privacy-note">
          🔒 All detection is local. This data was not sent anywhere.
        </p>
      </div>

      {/* Actions */}
      <div className="warning-actions">
        <button
          id="leaklens-cancel-btn"
          className="btn-cancel"
          onClick={() => sendDecision('cancel')}
          autoFocus
          disabled={decided}
        >
          ← Go back and review
        </button>
        <button
          id="leaklens-proceed-btn"
          className="btn-proceed"
          onClick={() => sendDecision('proceed')}
          disabled={decided}
        >
          I understand, submit anyway
        </button>
      </div>
    </div>
  );
}
