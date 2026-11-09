# LeakLens Architecture & Design Specification

LeakLens is a local-first, privacy-preserving browser extension designed to prevent unintentional sensitive data exposure before submission across modern web interfaces.

---

## 1. High-Level Architecture Overview

```mermaid
flowchart TD
    subgraph Browser Context ["Webpage DOM (Isolated World)"]
        DOM[Inputs / Textareas / Contenteditable]
        FO[FieldObserver]
        BM[BadgeManager]
        MC[ModalController (Shadow DOM)]
        DE[DetectionEngine]
        DR[DetectorRegistry]
    end

    subgraph Service Worker ["Extension Background (Manifest V3)"]
        SW[Background Service Worker]
        MR[MessageRouter]
        AT[ApprovalTracker (In-Memory Session)]
        SC[SessionCounter (In-Memory Session)]
        PM[PolicyManager]
        SM[StorageManager (chrome.storage)]
    end

    DOM -->|Typing / Paste / Keydown| FO
    FO -->|Analyze Raw Field Value| DE
    DE -->|Evaluate Registered Detectors| DR
    DE -->|Risk Assessment| FO
    FO -->|Real-Time Floating Pill| BM
    FO -->|Intercept Enter / Submit| MC
    MC -->|Decision: proceed / cancel| FO
    FO -->|Record Alert Metric (No Content)| MR
    MR --> SC
    MR --> AT
    MR --> PM
    PM --> SM
```

---

## 2. Core Security & Privacy Guarantees

1. **Zero External Network Exfiltration**:
   - The extension contains **no analytics, no telemetry, no tracking pixels, and no remote API dependencies**.
   - Analysis runs 100% synchronously and locally in memory on the client machine.
   - Extension CSP: `connect-src 'none'; object-src 'none'; script-src 'self'`.

2. **Isolated Storage Model**:
   - Raw field values are typed as branded `RawFieldValue` and exist exclusively during the lifecycle of the `analyze()` call.
   - Storage (`chrome.storage.local`) only retains user configuration, per-domain policy rules, and custom regex definitions.
   - Metrics and session counters are stored purely in volatile memory (`SessionCounter`), clearing automatically when the browser closes.

3. **CSP-Immune Shadow DOM Modal**:
   - The blocking interception modal renders in an isolated `ShadowRoot` attached to the document root rather than an `<iframe>`.
   - This bypasses host-page `frame-src 'self'` Content-Security-Policies (which break extensions on sites like ChatGPT and GitHub).
   - All styles are scoped, preventing host CSS contamination and leakage.

---

## 3. Detection Engine & Validation Algorithms

LeakLens prioritizes deterministic, algorithmic verification over naive regular expressions to eliminate false positives:

| Detector | Category | Algorithmic Validation |
|---|---|---|
| **AadhaarDetector** | `IDENTITY_GOV_IN` | 12-digit format, starts with 2–9, validates check digit via dihedral group D5 **Verhoeff algorithm**. |
| **CardDetector** | `PAYMENT_CARD` | Prefix matching (Visa, Mastercard, Amex, RuPay, etc.), **Luhn checksum (Mod 10)**, test card exclusion list. |
| **PANDetector** | `IDENTITY_GOV_IN` | 5 uppercase letters + 4 digits + 1 letter; verifies 4th character taxpayer status (`P`, `C`, `H`, etc.). |
| **UPIDetector** | `PAYMENT_UPI` | Validates handles against official NPCI-registered Virtual Payment Address (VPA) provider suffixes. |
| **BankDetector** | `PAYMENT_BANK` | 11-character Indian Financial System Code (IFSC) + Indian bank account length & structure rules. |
| **APIKeyDetector** | `AUTH_SECRET` | 14 known provider formats (GitHub PAT, Stripe, AWS, OpenAI, Google) + Shannon entropy calculation ($\ge 4.0$ bits/char). |
| **CustomRuleDetector** | `CUSTOM` | User-defined declarative regex rules with 512-character ReDoS limits and optional Luhn check. |

---

## 4. Multi-Phase Warning Flow

LeakLens enforces a non-intrusive two-tier disclosure workflow:

1. **Typing Phase (`isSubmitAction = false`)**:
   - Analyzes data on input / paste events.
   - Displays a lightweight, floating pill badge (`🛡 ⚠ Aadhaar`) positioned via viewport coordinates (`getBoundingClientRect()`).
   - Does not disrupt typing flow or block user inputs.

2. **Submission Phase (`isSubmitAction = true`)**:
   - Intercepts `Enter` key presses (for SPAs like ChatGPT / Claude / Search bars) and native `<form submit>` events in the **capture phase**.
   - Halts propagation (`preventDefault()`, `stopImmediatePropagation()`).
   - Displays the modal dialog showing masked previews (e.g., `2345••••••24`).
   - Prompts for explicit action: **"← Go back and review"** (safe default) or **"I understand, submit anyway"** (grants temporary single-action bypass).

---

## 5. Technology Stack

- **Framework**: [WXT](https://wxt.dev) (Vite-based Next-gen WebExtension framework)
- **Language**: TypeScript (Strict Mode)
- **UI Architecture**: React 18 (Options, Popup, Onboarding) + Vanilla Shadow DOM (Content Script Modal)
- **Validation**: Zod (Schema validation for stored settings and managed enterprise policies)
- **Test Framework**: Vitest (224 unit tests covering all checksums, detectors, and storage)
- **Targets**: Chrome (Manifest V3), Edge (Manifest V3), Firefox (Manifest V2 Gecko)

