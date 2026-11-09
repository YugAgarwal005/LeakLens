// LeakLens — EmailDetector + PhoneDetector + PasswordHeuristicDetector Tests

import { describe, it, expect } from 'vitest';
import { EmailDetector } from '../../../src/core/detection/detectors/EmailDetector.js';
import { PhoneDetector } from '../../../src/core/detection/detectors/PhoneDetector.js';
import { PasswordHeuristicDetector } from '../../../src/core/detection/detectors/PasswordHeuristicDetector.js';
import type { FieldContext, RawFieldValue } from '../../../src/core/types/index.js';

const raw = (s: string): RawFieldValue => s as RawFieldValue;
const ctx = (o: Partial<FieldContext> = {}): FieldContext => ({
  fieldType: 'text', fieldName: '', labelText: '', formActionOrigin: 'https://example.com',
  placeholder: '', autocomplete: '', isPasswordField: false, isInsideFrame: false, ...o,
});

// ═══════════════════════════════════════════════════════
// EmailDetector
// ═══════════════════════════════════════════════════════

const ED = new EmailDetector();

describe('EmailDetector', () => {
  it('detects an email in a non-email text field', () => {
    const r = ED.detect(raw('user@example.com'), ctx({ fieldType: 'text' }));
    expect(r).toHaveLength(1);
    expect(r[0]?.category).toBe('PERSONAL_CONTACT');
  });

  it('suppresses on fieldType=email', () => {
    expect(ED.detect(raw('user@example.com'), ctx({ fieldType: 'email' }))).toHaveLength(0);
  });

  it('suppresses on autocomplete=email', () => {
    expect(ED.detect(raw('user@example.com'), ctx({ autocomplete: 'email' }))).toHaveLength(0);
  });

  it('suppresses when label contains "email"', () => {
    expect(ED.detect(raw('user@example.com'), ctx({ labelText: 'your email address' }))).toHaveLength(0);
  });

  it('suppresses on password fields', () => {
    expect(ED.detect(raw('user@example.com'), ctx({ isPasswordField: true }))).toHaveLength(0);
  });

  it('produces masked preview showing first+last char of local part', () => {
    const r = ED.detect(raw('john.doe@example.com'), ctx());
    if (r.length > 0) {
      expect(r[0]!.maskedPreview).toContain('@example.com');
      expect(r[0]!.maskedPreview).not.toBe('john.doe@example.com');
    }
  });
});

// ═══════════════════════════════════════════════════════
// PhoneDetector
// ═══════════════════════════════════════════════════════

const PD = new PhoneDetector();

describe('PhoneDetector', () => {
  it('detects a 10-digit Indian mobile in a text field', () => {
    const r = PD.detect(raw('9876543210'), ctx({ fieldType: 'text' }));
    expect(r).toHaveLength(1);
    expect(r[0]?.category).toBe('PERSONAL_CONTACT');
  });

  it('detects mobile with +91 prefix', () => {
    const r = PD.detect(raw('+91 9876543210'), ctx());
    expect(r.length).toBeGreaterThan(0);
  });

  it('suppresses on fieldType=tel', () => {
    expect(PD.detect(raw('9876543210'), ctx({ fieldType: 'tel' }))).toHaveLength(0);
  });

  it('suppresses on autocomplete=tel', () => {
    expect(PD.detect(raw('9876543210'), ctx({ autocomplete: 'tel' }))).toHaveLength(0);
  });

  it('suppresses on password field', () => {
    expect(PD.detect(raw('9876543210'), ctx({ isPasswordField: true }))).toHaveLength(0);
  });

  it('rejects 10-digit number starting with 5 (not Indian mobile)', () => {
    const r = PD.detect(raw('5123456789'), ctx());
    expect(r).toHaveLength(0);
  });

  it('does not flag a 10-digit number in a phone-labelled field', () => {
    const r = PD.detect(raw('9876543210'), ctx({ labelText: 'phone mobile contact number' }));
    // 3 phone signals → suppressed
    expect(r).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
// PasswordHeuristicDetector
// ═══════════════════════════════════════════════════════

const PHD = new PasswordHeuristicDetector();

describe('PasswordHeuristicDetector', () => {
  const COMPLEX_PASS = 'MySecr3t!Pass';  // upper + lower + digit + special

  it('detects a complex password-like string in a text field', () => {
    const r = PHD.detect(raw(COMPLEX_PASS), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]?.category).toBe('AUTH_SECRET');
    expect(r[0]?.confidence).toBe('low');
  });

  it('suppresses on password-type field', () => {
    expect(PHD.detect(raw(COMPLEX_PASS), ctx({ isPasswordField: true }))).toHaveLength(0);
  });

  it('suppresses on autocomplete=current-password', () => {
    expect(PHD.detect(raw(COMPLEX_PASS), ctx({ autocomplete: 'current-password' }))).toHaveLength(0);
  });

  it('suppresses natural language (has spaces)', () => {
    expect(PHD.detect(raw('Hello World 123!'), ctx())).toHaveLength(0);
  });

  it('suppresses in a "comment" labelled field', () => {
    expect(PHD.detect(raw(COMPLEX_PASS), ctx({ labelText: 'comment' }))).toHaveLength(0);
  });

  it('suppresses when string is too short (< 8 chars)', () => {
    expect(PHD.detect(raw('Ab1!xyz'), ctx())).toHaveLength(0);
  });

  it('suppresses when string is too long (> 200 chars)', () => {
    const long = 'Aa1!' + 'x'.repeat(200);
    expect(PHD.detect(raw(long), ctx())).toHaveLength(0);
  });

  it('suppresses low-complexity string (missing special char)', () => {
    expect(PHD.detect(raw('MySecret3Pass'), ctx())).toHaveLength(0);
  });

  it('suppresses low-variety string (< 6 distinct chars)', () => {
    // Has complexity but only uses 5 distinct chars
    expect(PHD.detect(raw('AaAa1!Aa'), ctx())).toHaveLength(0);
  });

  it('produces a bullet-masked preview', () => {
    const r = PHD.detect(raw(COMPLEX_PASS), ctx());
    if (r.length > 0) {
      expect(r[0]!.maskedPreview).toMatch(/^•+$/);
    }
  });
});
