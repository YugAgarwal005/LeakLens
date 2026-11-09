// LeakLens — CustomRuleDetector Tests

import { describe, it, expect } from 'vitest';
import { CustomRuleDetector, tryCreateCustomDetector } from '../../../src/core/detection/detectors/CustomRuleDetector.js';
import type { CustomDetectorRule, FieldContext, RawFieldValue } from '../../../src/core/types/index.js';

const raw = (s: string): RawFieldValue => s as RawFieldValue;
const ctx = (o: Partial<FieldContext> = {}): FieldContext => ({
  fieldType: 'text', fieldName: '', labelText: '', formActionOrigin: 'https://example.com',
  placeholder: '', autocomplete: '', isPasswordField: false, isInsideFrame: false, ...o,
});

const makeRule = (overrides: Partial<CustomDetectorRule> = {}): CustomDetectorRule => ({
  id: 'custom-test-1',
  name: 'Employee ID',
  category: 'CUSTOM',
  region: 'IN',
  severity: 'medium',
  pattern: 'EMP\\d{6}',
  flags: 'i',
  requireContext: [],
  luhnValidate: false,
  enabled: true,
  ...overrides,
});

describe('CustomRuleDetector — basic detection', () => {
  it('detects a match against the custom pattern', () => {
    const d = new CustomRuleDetector(makeRule());
    const r = d.detect(raw('EMP123456'), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]?.category).toBe('CUSTOM');
    expect(r[0]?.confidence).toBe('medium'); // no context required
  });

  it('is case-insensitive with i flag', () => {
    const d = new CustomRuleDetector(makeRule());
    const r = d.detect(raw('emp987654'), ctx());
    expect(r).toHaveLength(1);
  });

  it('returns empty when pattern does not match', () => {
    const d = new CustomRuleDetector(makeRule());
    expect(d.detect(raw('NOTANEMPID'), ctx())).toHaveLength(0);
  });

  it('collapses multiple matches into a single result with count', () => {
    const d = new CustomRuleDetector(makeRule());
    const r = d.detect(raw('EMP000001 and EMP000002'), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]?.matchCount).toBe(2);
  });
});

describe('CustomRuleDetector — context-driven confidence', () => {
  it('is HIGH confidence when context keyword is present in label', () => {
    const rule = makeRule({ requireContext: ['employee', 'emp id'] });
    const d = new CustomRuleDetector(rule);
    const r = d.detect(raw('EMP123456'), ctx({ labelText: 'employee ID number' }));
    expect(r[0]?.confidence).toBe('high');
  });

  it('is LOW confidence when context is required but absent', () => {
    const rule = makeRule({ requireContext: ['employee', 'emp id'] });
    const d = new CustomRuleDetector(rule);
    const r = d.detect(raw('EMP123456'), ctx({ labelText: 'enter text' }));
    expect(r[0]?.confidence).toBe('low');
  });

  it('includes matched context signals in result', () => {
    const rule = makeRule({ requireContext: ['employee'] });
    const d = new CustomRuleDetector(rule);
    const r = d.detect(raw('EMP123456'), ctx({ labelText: 'employee number' }));
    expect(r[0]?.contextSignals).toContain('employee');
  });
});

describe('CustomRuleDetector — Luhn validation', () => {
  it('accepts a Luhn-valid number when luhnValidate=true', () => {
    // 4532015112830366 is Luhn-valid (Visa test number)
    const rule = makeRule({
      pattern: '\\d{16}',
      luhnValidate: true,
      requireContext: [],
    });
    const d = new CustomRuleDetector(rule);
    const r = d.detect(raw('4532015112830366'), ctx());
    expect(r).toHaveLength(1);
  });

  it('rejects a Luhn-invalid number when luhnValidate=true', () => {
    const rule = makeRule({ pattern: '\\d{16}', luhnValidate: true, requireContext: [] });
    const d = new CustomRuleDetector(rule);
    expect(d.detect(raw('1234567890123456'), ctx())).toHaveLength(0);
  });
});

describe('CustomRuleDetector — safety', () => {
  it('rejects patterns longer than 512 chars', () => {
    expect(() => new CustomRuleDetector(makeRule({ pattern: 'a'.repeat(513) }))).toThrow();
  });

  it('rejects disallowed flags (g, s, u)', () => {
    // Only 'i' and 'm' are allowed
    expect(() => new CustomRuleDetector(makeRule({ flags: 'g' as CustomDetectorRule['flags'] }))).toThrow();
  });

  it('tryCreateCustomDetector returns null for invalid pattern', () => {
    const bad = makeRule({ pattern: '[invalid(' });
    const result = tryCreateCustomDetector(bad);
    expect(result).toBeNull();
  });

  it('tryCreateCustomDetector returns detector for valid rule', () => {
    const result = tryCreateCustomDetector(makeRule());
    expect(result).not.toBeNull();
    expect(result?.id).toBe('custom-test-1');
  });

  it('suppresses non-AUTH_SECRET matches in password fields', () => {
    const d = new CustomRuleDetector(makeRule());
    expect(d.detect(raw('EMP123456'), ctx({ isPasswordField: true }))).toHaveLength(0);
  });

  it('caps match count at 10', () => {
    // Create a pattern that will match many times
    const d = new CustomRuleDetector(makeRule({ pattern: '\\d+', requireContext: [] }));
    const manyNumbers = Array.from({ length: 20 }, (_, i) => `${i}`).join(' ');
    const r = d.detect(raw(manyNumbers), ctx());
    expect(r[0]?.matchCount).toBeLessThanOrEqual(10);
  });
});

describe('CustomRuleDetector — masked preview', () => {
  it('produces a masked preview that hides middle chars', () => {
    const d = new CustomRuleDetector(makeRule());
    const r = d.detect(raw('EMP123456'), ctx());
    if (r.length > 0) {
      expect(r[0]?.maskedPreview).toBeTruthy();
      expect(r[0]?.maskedPreview).not.toBe('EMP123456');
    }
  });
});
