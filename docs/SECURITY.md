# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security vulnerabilities by emailing: **security@leaklens.example** *(update this before public release)*

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any relevant logs or screenshots (redact any sensitive data)
- Your proposed mitigation if you have one

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Scope

The following are in scope:
- Detection bypasses that could allow sensitive data to be submitted without a warning
- Warning UI spoofing that could trick users into thinking the warning came from a page
- Extension message abuse that could allow one tab to access or manipulate another's state
- Storage exposure of raw sensitive field values
- Cross-origin information leakage

The following are **not** in scope (known limitations):
- Bypasses via `fetch()`/`XHR` — these are documented limitations, not vulnerabilities
- User deliberately disabling the extension
- Bypasses requiring OS-level access or browser debugger access

## Privacy

If your report involves discovery of sensitive user data (e.g., logs accidentally containing field values), please handle this data minimally and destroy it after reporting.
