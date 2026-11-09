import React, { useEffect, useState, useCallback } from 'react';
import type { DataCategory, DomainPolicyType } from '../../src/core/types/index';
import './App.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionCounts { counts: Partial<Record<DataCategory, number>>; total: number; }
interface DomainPolicy { policyType: DomainPolicyType; }

const CATEGORY_LABELS: Record<DataCategory, string> = {
  IDENTITY_GOV_IN:  'Gov ID',
  PAYMENT_CARD:     'Cards',
  PAYMENT_UPI:      'UPI',
  PAYMENT_BANK:     'Banking',
  PERSONAL_CONTACT: 'Contact',
  AUTH_SECRET:      'Secrets',
  CUSTOM:           'Custom',
};

const POLICY_LABELS: Record<DomainPolicyType, { label: string; dot: string; desc: string }> = {
  default:  { label: 'Active',        dot: 'dot-active',  desc: 'LeakLens is protecting this site' },
  trusted:  { label: 'Trusted site',  dot: 'dot-trusted', desc: 'Reduced sensitivity on this domain' },
  excluded: { label: 'Excluded',      dot: 'dot-excluded',desc: 'LeakLens is disabled here' },
  stricter: { label: 'High security', dot: 'dot-stricter',desc: 'Stricter rules applied' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statColorClass(n: number): string {
  if (n === 0) return 'stat-zero';
  if (n < 3)   return 'stat-low';
  if (n < 8)   return 'stat-med';
  return 'stat-high';
}

async function queryActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export default function App() {
  const [enabled, setEnabled]         = useState(true);
  const [policy, setPolicy]           = useState<DomainPolicyType>('default');
  const [origin, setOrigin]           = useState<string>('');
  const [session, setSession]         = useState<SessionCounts>({ counts: {}, total: 0 });
  const [loading, setLoading]         = useState(true);

  // Load data on mount
  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const tab = await queryActiveTab();
      const tabOrigin = tab?.url ? (() => { try { return new URL(tab.url!).origin; } catch { return ''; } })() : '';
      setOrigin(tabOrigin);

      const [sessionRes, settingsRes, policyRes] = await Promise.all([
        browser.runtime.sendMessage({ type: 'LEAKLENS_GET_SESSION_COUNTS' }),
        browser.runtime.sendMessage({ type: 'LEAKLENS_GET_SETTINGS' }),
        tabOrigin
          ? browser.runtime.sendMessage({ type: 'LEAKLENS_GET_DOMAIN_POLICY', origin: tabOrigin })
          : Promise.resolve(null),
      ]);

      if (sessionRes && typeof sessionRes === 'object' && 'total' in sessionRes) {
        setSession(sessionRes as SessionCounts);
      }
      if (settingsRes && typeof settingsRes === 'object' && 'enabled' in settingsRes) {
        setEnabled((settingsRes as { enabled: boolean }).enabled !== false);
      }
      if (policyRes && typeof policyRes === 'object' && 'policyType' in policyRes) {
        setPolicy((policyRes as DomainPolicy).policyType);
      }
    } catch {
      // Service worker unavailable
    }
    setLoading(false);
  };

  const toggleEnabled = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      const existing = await browser.storage.local.get('settings') as { settings?: Record<string, unknown> };
      await browser.storage.local.set({
        settings: { ...(existing.settings ?? {}), enabled: next },
      });
    } catch { /* ignore */ }
  }, [enabled]);

  const openOptions = useCallback(() => {
    void browser.runtime.openOptionsPage();
  }, []);

  // Stats to display (top categories with non-zero counts + totals)
  const statEntries = Object.entries(CATEGORY_LABELS) as [DataCategory, string][];
  const activeStats = statEntries
    .map(([cat, label]) => ({ cat, label, count: session.counts[cat] ?? 0 }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const policyInfo = POLICY_LABELS[policy];

  return (
    <div className="popup-root">
      {/* ── Header ── */}
      <header className="popup-header">
        <div className="popup-logo-wrap">
          <img src={browser.runtime.getURL('/icons/icon-48.png')} alt="LeakLens" />
        </div>
        <div className="popup-wordmark">
          <h1>LeakLens</h1>
          <p>Sensitive data protection</p>
        </div>
        <span className={`badge ${enabled ? 'badge-success' : 'badge-dim'}`}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </header>

      {/* ── Site status ── */}
      <div className="site-status" role="status" aria-label="Site protection status">
        <span className={`site-status-dot ${policyInfo.dot}`} aria-hidden="true" />
        <div className="site-status-info">
          <div className="site-status-origin" title={origin || 'No page active'}>
            {origin ? origin.replace(/^https?:\/\//, '') : 'No page active'}
          </div>
          <div className="site-status-policy">{policyInfo.label} — {policyInfo.desc}</div>
        </div>
      </div>

      {/* ── Session stats ── */}
      <section className="session-section" aria-labelledby="stats-heading">
        <p id="stats-heading" className="section-label">This session</p>

        {loading ? (
          <div style={{ padding: '12px 0', color: 'var(--text-dim)', fontSize: '12px' }}>Loading…</div>
        ) : session.total === 0 ? (
          <div className="empty-state" style={{ padding: '16px 0' }}>
            <span className="empty-icon">🛡</span>
            <p>No sensitive data detected yet</p>
          </div>
        ) : (
          <>
            {/* Total */}
            <div className="stat-card" style={{ gridColumn: '1/-1', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="stat-label" style={{ fontSize: '12px' }}>Total warnings</span>
              <span className={`stat-count ${statColorClass(session.total)}`} style={{ fontSize: '28px' }}>
                {session.total}
              </span>
            </div>
            {/* Per-category grid */}
            {activeStats.length > 0 && (
              <div className="session-grid">
                {activeStats.map(({ cat, label, count }) => (
                  <div key={cat} className="stat-card">
                    <span className={`stat-count ${statColorClass(count)}`}>{count}</span>
                    <span className="stat-label">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Master toggle ── */}
      <div className="master-toggle">
        <span className="master-toggle-label">Protection enabled</span>
        <label className="toggle" aria-label={`Toggle protection ${enabled ? 'off' : 'on'}`}>
          <input
            type="checkbox"
            id="master-toggle-input"
            checked={enabled}
            onChange={toggleEnabled}
          />
          <span className="toggle-track" />
        </label>
      </div>

      {/* ── Footer ── */}
      <footer className="popup-footer">
        <a
          href="#"
          className="popup-footer-link"
          id="open-options-link"
          onClick={(e) => { e.preventDefault(); openOptions(); }}
          aria-label="Open settings page"
        >
          ⚙ Settings
        </a>
        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>v0.1.0</span>
        <a
          href="https://github.com/leaklens/leaklens"
          target="_blank"
          rel="noreferrer noopener"
          className="popup-footer-link"
          id="github-link"
        >
          GitHub ↗
        </a>
      </footer>
    </div>
  );
}
