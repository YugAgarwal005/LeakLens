import React from 'react';
import './Onboarding.css';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: '🛡',
    color: '#7c6af7',
    title: '100% Local Detection',
    desc: 'Every analysis happens inside your browser. No data ever leaves your device — not even masked previews.',
  },
  {
    icon: '⚡',
    color: '#ffa502',
    title: 'Real-time Warnings',
    desc: 'A subtle badge appears while you type. A full warning dialog intercepts only at form submission.',
  },
  {
    icon: '🔍',
    color: '#2ed573',
    title: '9 Built-in Detectors',
    desc: 'Aadhaar, PAN, UPI, bank details, payment cards, API keys, passwords, emails, and phone numbers.',
  },
  {
    icon: '🌐',
    color: '#70a1ff',
    title: 'Per-domain Policies',
    desc: 'Trust your bank. Exclude your company portal. Apply stricter rules where it matters most.',
  },
  {
    icon: '🔧',
    color: '#a29bfe',
    title: 'Custom Rules',
    desc: 'Add your own regex-based patterns — employee IDs, account codes, any identifier you care about.',
  },
  {
    icon: '🏢',
    color: '#ff6b81',
    title: 'Enterprise Ready',
    desc: 'Architecture supports chrome.storage.managed overlay for IT-managed policy deployment.',
  },
];

const STEPS = [
  {
    title: 'Extension active',
    desc: 'LeakLens is already running. No setup required — detection starts the moment you open a webpage.',
  },
  {
    title: 'Type in any form',
    desc: 'As you type, detected sensitive values get a subtle inline badge. Nothing is sent anywhere.',
  },
  {
    title: 'Warning before you submit',
    desc: 'If a form submission would expose sensitive data, you see exactly what was detected (masked) and choose to go back or proceed.',
  },
  {
    title: 'Approve is temporary',
    desc: '"Submit anyway" approval lasts 5 minutes or until you navigate. It is never remembered permanently.',
  },
];

const DETECTOR_PILLS = [
  { name: 'Aadhaar (Verhoeff)',  color: '#ff4757' },
  { name: 'PAN Card',            color: '#ff4757' },
  { name: 'Payment Cards (Luhn)',color: '#ffa502' },
  { name: 'UPI ID (47 PSPs)',    color: '#2ed573' },
  { name: 'IFSC / Bank Account', color: '#70a1ff' },
  { name: 'API Keys & Tokens',   color: '#ff6b81' },
  { name: 'Password Heuristic',  color: '#ff6b81' },
  { name: 'Email Addresses',     color: '#9494b8' },
  { name: 'Phone Numbers',       color: '#9494b8' },
  { name: 'Custom Rules',        color: '#a29bfe' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingApp() {
  const openOptions = () => browser.runtime.openOptionsPage();

  return (
    <div className="onboarding-root">

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-badge">🔒 Privacy-first · Local-only · Open source</div>
        <div className="hero-logo">
          <img src={browser.runtime.getURL('/icons/icon-48.png')} alt="LeakLens" />
        </div>
        <h1 className="hero-title">LeakLens</h1>
        <p className="hero-tagline">
          Real-time sensitive data protection for your browser.
          Detect Aadhaar, PAN, payment cards, API keys, and more —
          before you accidentally submit them.
        </p>
        <div className="hero-cta-group">
          <button
            className="btn btn-primary btn-xl"
            id="get-started-btn"
            onClick={openOptions}
          >
            ⚙ Open Settings
          </button>
          <a
            className="btn btn-secondary btn-xl"
            id="github-link"
            href="https://github.com/leaklens/leaklens"
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub ↗
          </a>
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section className="features" aria-label="Key features">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature-card">
            <div className="feature-icon" style={{ background: `${f.color}18` }}>
              {f.icon}
            </div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </article>
        ))}
      </section>

      {/* ── How it works ── */}
      <section className="how-section" aria-labelledby="how-title">
        <h2 id="how-title" className="how-title">How LeakLens works</h2>
        <ol className="steps" role="list">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <div className="step-num" aria-label={`Step ${i + 1}`}>{i + 1}</div>
              <div className="step-content">
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Detector showcase ── */}
      <section className="detectors-section" aria-labelledby="detectors-title">
        <h2 id="detectors-title" className="how-title">What gets detected</h2>
        <div className="detectors-grid">
          {DETECTOR_PILLS.map((d) => (
            <div key={d.name} className="detector-pill">
              <span
                className="detector-dot"
                style={{ background: d.color, boxShadow: `0 0 6px ${d.color}80` }}
                aria-hidden="true"
              />
              {d.name}
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="cta-section">
        <h2>Ready to go</h2>
        <p>
          LeakLens is already active. Open Settings to configure domain policies,
          adjust which detectors run, or add custom patterns for your organisation.
        </p>
        <button
          className="btn btn-primary btn-xl"
          id="cta-settings-btn"
          onClick={openOptions}
        >
          Open Settings →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="onboarding-footer">
        <span>LeakLens v0.1.0 — MIT License</span>
        <span>
          <a href="https://github.com/leaklens/leaklens/blob/main/PRIVACY.md" target="_blank" rel="noreferrer">Privacy Policy</a>
          {' · '}
          <a href="https://github.com/leaklens/leaklens/issues" target="_blank" rel="noreferrer">Report an Issue</a>
        </span>
        <span>All detection is local · Nothing leaves your browser</span>
      </footer>
    </div>
  );
}
