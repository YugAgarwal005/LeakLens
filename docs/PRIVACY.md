# Privacy Policy & Architecture Guarantee

**Last Updated:** November 2026

LeakLens was built from the ground up on the principle of **radical client-side privacy**. Traditional security tools often send your keystrokes or submitted text to remote cloud servers for analysis. LeakLens rejects this model entirely.

---

## 1. Zero Network Exfiltration

- **No Remote Analysis**: 100% of detection, checksum validation, and risk scoring occurs entirely inside your local browser instance.
- **No Telemetry or Tracking**: LeakLens does not include Google Analytics, Sentry, Mixpanel, Segment, or any remote logging SDK.
- **Strict Network CSP**: The extension manifest enforces `connect-src 'none'`, preventing the extension from making HTTP/WebSocket requests to external endpoints.

---

## 2. Ephemeral In-Memory Processing

- **No Value Retention**: Field values entered in web inputs are typed as branded `RawFieldValue` and exist exclusively in volatile memory for the milliseconds required to evaluate the detection pipeline.
- **Masked Previews Only**: When a warning dialog appears, values are masked (e.g. `2345••••••24` or `sk_live_••••••32`). The raw value is never stored or transmitted.
- **Volatile Counters**: Leak interception counts shown in the toolbar popup are stored in volatile memory (`chrome.storage.session`). When you close your browser, all counts reset to zero.

---

## 3. Storage Transparency

LeakLens utilizes `chrome.storage.local` solely for persistent user configurations:
- Enabled/disabled state of individual detectors
- Domain policies (`trusted`, `stricter`, `excluded`)
- User-defined declarative custom regex rules
- General preferences (badge toggle, auto-save settings)

No passwords, personal data, browsing history, or intercepted content is ever saved to persistent storage.

---

## 4. Permissions Scope

| Permission | Justification |
|---|---|
| `storage` | Stores user configuration, domain rules, and detector toggles locally. |
| `activeTab` / `tabs` | Resolves the top-level origin of the current tab for domain policy matching. |
| `scripting` | Enables dynamic injection of content scripts across tabs upon update or reload. |
| `alarms` | Periodically prunes expired temporary action approvals (5-minute expiry). |

---

## 5. Open Source & Auditability

The entire codebase is open source under the MIT License. Anyone can inspect, build, and verify that no network requests or unauthorized data persistence occur.

