// LeakLens — BankDetector Tests

import { describe, it, expect } from 'vitest';
import { BankDetector } from '../../../src/core/detection/detectors/BankDetector.js';
import type { FieldContext, RawFieldValue } from '../../../src/core/types/index.js';

const D = new BankDetector();
const raw = (s: string): RawFieldValue => s as RawFieldValue;
const ctx = (o: Partial<FieldContext> = {}): FieldContext => ({
  fieldType: 'text', fieldName: '', labelText: '', formActionOrigin: 'https://example.com',
  placeholder: '', autocomplete: '', isPasswordField: false, isInsideFrame: false, ...o,
});

describe('BankDetector — IFSC detection', () => {
  it('detects a valid IFSC code (SBIN0001234)', () => {
    const r = D.detect(raw('SBIN0001234'), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]?.category).toBe('PAYMENT_BANK');
  });

  it('detects HDFC IFSC (HDFC0001234)', () => {
    expect(D.detect(raw('HDFC0001234'), ctx())).toHaveLength(1);
  });

  it('detects ICICI IFSC (ICIC0001234)', () => {
    expect(D.detect(raw('ICIC0001234'), ctx())).toHaveLength(1);
  });

  it('rejects IFSC where 5th character is not 0 (SBIN1001234)', () => {
    expect(D.detect(raw('SBIN1001234'), ctx())).toHaveLength(0);
  });

  it('rejects IFSC with only 3 bank letters (SBI0001234)', () => {
    expect(D.detect(raw('SBI0001234'), ctx())).toHaveLength(0);
  });

  it('gives high confidence IFSC with IFSC label', () => {
    const r = D.detect(raw('SBIN0001234'), ctx({ labelText: 'ifsc code' }));
    expect(r[0]?.confidence).toBe('high');
  });

  it('gives medium confidence IFSC without label', () => {
    const r = D.detect(raw('SBIN0001234'), ctx());
    expect(r[0]?.confidence).toBe('medium');
  });

  it('masked preview shows bank code + 0XXXXXX', () => {
    const r = D.detect(raw('HDFC0001234'), ctx());
    expect(r[0]?.maskedPreview).toBe('HDFC0XXXXXX');
  });
});

describe('BankDetector — account number detection', () => {
  it('detects 11-digit account number when labelled "account number"', () => {
    const r = D.detect(raw('12345678901'), ctx({ labelText: 'account number' }));
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT detect 11-digit number with no account context', () => {
    const r = D.detect(raw('12345678901'), ctx());
    expect(r).toHaveLength(0);
  });

  it('does NOT flag a 10-digit Indian mobile as an account number', () => {
    const r = D.detect(raw('9876543210'), ctx({ labelText: 'bank account' }));
    // Phone number starting with 9 should be skipped by BankDetector
    expect(r).toHaveLength(0);
  });

  it('does NOT flag a 16-digit number (card-length — handled by CardDetector)', () => {
    const r = D.detect(raw('1234567890123456'), ctx({ labelText: 'account number' }));
    expect(r).toHaveLength(0);
  });

  it('suppresses on password field', () => {
    expect(D.detect(raw('SBIN0001234'), ctx({ isPasswordField: true }))).toHaveLength(0);
  });
});
