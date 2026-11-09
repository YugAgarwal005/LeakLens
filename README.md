# LeakLens 🔍🛡️

> **Privacy-first, real-time sensitive data protection for modern browsers.**  
> Detects Aadhaar, PAN cards, payment cards, UPI IDs, API keys, and credentials before you accidentally expose them on websites.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](tsconfig.json)
[![WXT Framework](https://img.shields.io/badge/Framework-WXT%200.21-orange?logo=vite)](https://wxt.dev)
[![Tests](https://img.shields.io/badge/Tests-224%20Passing-brightgreen?logo=vitest)](tests/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-purple)](wxt.config.ts)

---

## Overview

**LeakLens** is a client-side Data Loss Prevention (DLP) browser extension designed for individual consumers and security-conscious teams. It intercepts accidental disclosures when users type, paste, or prepare to submit confidential information into web forms, AI chat interfaces (like ChatGPT and Claude), search engines, and single-page applications.

### 🔒 100% Client-Side Privacy
- **Zero Network Exfiltration**: No telemetry, no external AI calls, no analytics, no cloud backends.
- **Strict Extension CSP**: Enforces `connect-src 'none'`, guaranteeing raw secrets never leave your device.
- **Ephemeral Processing**: Keystrokes and values are processed purely in-memory and discarded immediately after local checksum analysis.

---

## Key Features

- **Algorithmic Verification (Zero False-Alarm Regex Spam)**:
  - 🪪 **Aadhaar Numbers**: Validates 12-digit format and Dihedral Group D5 **Verhoeff Checksum**.
  - 💳 **Credit & Debit Cards**: Validates major networks (Visa, MC, Amex, RuPay) using the **Luhn Algorithm (Mod 10)**.
  - 🗂 **PAN Cards**: Validates 10-character structure and 4th-character taxpayer classification (`P`, `C`, `H`, etc.).
  - 📱 **UPI IDs**: Verifies virtual payment addresses against official NPCI PSP provider handles (`@okaxis`, `@oksbi`, etc.).
  - 🏦 **Bank IFSC & Accounts**: Validates 11-character RBI IFSC structure and account number sequences.
  - 🔑 **API Keys & Secrets**: Detects 14+ known provider formats (GitHub PAT, Stripe, AWS, OpenAI, Google) + Shannon entropy calculation ($\ge 4.0$ bits/char).
  - ⚙️ **Custom Rule Engine**: Build declarative regex rules with ReDoS protection (512-character cap) and optional Luhn check.
- **Two-Phase Warning Flow**:
  1. *Typing Phase*: Non-blocking, high-contrast floating pill (`🛡 ⚠ Aadhaar`) anchored to viewport coordinates.
  2. *Submission Phase*: Full modal block on `Enter` key presses or `<form submit>` events.
- **CSP-Immune Shadow DOM Modal**:
  - Rendered inside an isolated `ShadowRoot`, completely bypassing restrictive host-page `frame-src 'self'` Content-Security-Policies that break `iframe`-based extensions on sites like ChatGPT and GitHub.
- **SPA & Dynamic Form Support**:
  - Intercepts both native form submissions and JavaScript `keydown` submissions across React, Vue, Next.js, and Angular applications.
- **Granular Domain Policies**:
  - Configure `trusted`, `stricter`, or `excluded` policies per domain.

---

## Quick Start & Demo

### 1. Installation & Local Build

```bash
# Clone repository
git clone https://github.com/your-username/LeakLens.git
cd LeakLens

# Install dependencies
npm install

# Build extension for Chrome / Edge (Manifest V3)
npm run build

# Build extension for Firefox (Manifest V2)
npm run build:firefox
```

### 2. Load into Your Browser

#### Google Chrome / Microsoft Edge:
1. Navigate to `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** (top-right corner).
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3` folder inside the project directory.

#### Mozilla Firefox:
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `.output/firefox-mv2/manifest.json`.

---

## Testing Detectors with Real Test Vectors

To test LeakLens, run the included interactive playground:
```bash
npm run demo
```
Navigate to **`http://localhost:8080/demo.html`** in your browser, or test directly on Google Search, ChatGPT, or any web form using these syntactically valid test vectors:

| Sensitive Category | Test Value to Copy-Paste | Why It Triggers |
|---|---|---|
| **Aadhaar Number** | `2345 6789 0124` | Passes strict UIDAI 12-digit format and Verhoeff check digit (`4`). |
| **Credit Card** | `5555 5555 5555 4444` | Valid Mastercard prefix, passes Luhn Mod-10 checksum. |
| **PAN Card** | `ABCPC1234A` | 5 letters + 4 digits + 1 letter; `C` (Company) taxpayer classification. |
| **UPI ID** | `rahul.kumar@okaxis` | NPCI Axis/GPay Virtual Payment Address handle. |
| **IFSC Code** | `SBIN0001234` | Valid SBI IFSC routing syntax. |
| **GitHub Token** | `ghp_1234567890abcdefghijklmnopqrstuvwxyzAB` | 40-character official Personal Access Token pattern. |
| **Stripe Secret** | `sk_test_1234567890abcdefghijklmnopqrstuv` | Test Stripe Secret Key pattern. |

---

## Project Structure

```
LeakLens/
├── assets/                     # Extension branding and vector icons
├── docs/                       # Architecture, Privacy, and Security specs
│   ├── ARCHITECTURE.md         # Full architectural design & data flow
│   ├── PRIVACY.md              # Zero-exfiltration privacy guarantee
│   └── SECURITY.md             # Vulnerability disclosure policy
├── entrypoints/                # WXT extension entrypoints
│   ├── background.ts           # Service worker & message routing
│   ├── content.ts              # Content script DOM injector
│   ├── onboarding/             # First-install welcome & setup page (React)
│   ├── options/                # Comprehensive settings & policy UI (React)
│   ├── popup/                  # Quick action toolbar popup (React)
│   └── warning/                # Warning dialog views
├── public/                     # Static assets bundled into extension root
│   └── icons/                  # 16px, 32px, 48px, 128px PNG icons
├── src/
│   ├── background/             # Session counters, approval tracker, message bus
│   ├── content/                # DOM observer, Shadow DOM modal, floating badges
│   └── core/                   # Pure business logic (framework-agnostic)
│       ├── detection/          # Detectors registry and 9 built-in detectors
│       │   ├── algorithms/     # Luhn & Verhoeff mathematical implementations
│       │   └── detectors/      # Aadhaar, PAN, Card, UPI, Bank, APIKey, etc.
│       ├── policy/             # Per-domain policy resolution
│       ├── risk/               # Risk assessment and multi-factor scoring
│       ├── storage/            # Type-safe Zod schema and chrome.storage wrapper
│       └── types/              # Branded types & interface definitions
├── tests/                      # Vitest unit test suite (224 unit tests)
│   └── unit/                   # Tests for algorithms, detectors, risk, and storage
├── demo.html                   # Local test page with pre-built form scenarios
├── package.json
├── tsconfig.json
└── wxt.config.ts               # Extension manifest and build configuration
```

---

## Verification & Quality Assurance

LeakLens maintains 100% test pass rates across all algorithmic validators and detector suites:

```bash
# Run complete test suite (224 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run test coverage audit
npm run test:coverage

# TypeScript strict type checking
npm run typecheck

# Code formatting
npm run format
```

---

## Architecture Summary

```
Webpage DOM                     Content Script                       Service Worker
┌──────────────┐   Typing    ┌──────────────────┐    Metrics Only   ┌─────────────────┐
│ Input / Form │ ──────────> │ DetectionEngine  │ ────────────────> │ SessionCounter  │
│              │             │  ├─ Verhoeff/Luhn│                   │  (In-Memory)    │
│              │ <────────── │  └─ Context Scorer                   └─────────────────┘
│              │   Floating  └──────────────────┘                            ▲
│              │     Badge            │ Enter / Submit                       │
│              │                      ▼ Interception                         │
│              │             ┌──────────────────┐    Decision Query          │
│ Interception │ <────────── │ ModalController  │ ───────────────────────────┘
│ Modal        │   ShadowDOM │ (100% CSP-Immune)│    (Single-action approval)
└──────────────┘             └──────────────────┘
```

For comprehensive deep dives into data flow, state machines, and threat models, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Contributing

Contributions are welcome! Please check out [`docs/SECURITY.md`](docs/SECURITY.md) before submitting sensitive detector rules or vulnerability reports.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-detector`)
3. Ensure all tests pass (`npm test`)
4. Commit your changes (`git commit -m 'Add new national ID detector'`)
5. Push to the branch (`git push origin feature/new-detector`)
6. Open a Pull Request

---

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
