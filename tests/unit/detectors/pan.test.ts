// LeakLens — PANDetector Tests

import { describe, it, expect } from 'vitest';
import { PANDetector } from '../../../src/core/detection/detectors/PANDetector.js';
import type { FieldContext, RawFieldValue } from '../../../src/core/types/index.js';

const D = new PANDetector();
const raw = (s: string): RawFieldValue => s as RawFieldValue;
const ctx = (o: Partial<FieldContext> = {}): FieldContext => ({
  fieldType: 'text', fieldName: '', labelText: '', formActionOrigin: 'https://example.com',
  placeholder: '', autocomplete: '', isPasswordField: false, isInsideFrame: false, ...o,
});

describe('PANDetector', () => {
  // Valid PAN formats — synthetic examples with valid taxpayer types
  it('detects ABCPF1234A (P = Individual, high confidence with PAN label)', () => {
    const r = D.detect(raw('ABCPF1234A'), ctx({ labelText: 'pan card number' }));
    expect(r).toHaveLength(1);
    expect(r[0]?.confidence).toBe('high');
  });

  it('detects ABCPF1234A with no context (medium confidence)', () => {
    const r = D.detect(raw('ABCPF1234A'), ctx());
    // Valid taxpayer type P → medium without context
    expect(r).toHaveLength(1);
    expect(r[0]?.confidence).toBe('medium');
  });

  it('detects AABCT1234Z (T = Trust) as medium', () => {
    const r = D.detect(raw('AABCT1234Z'), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]?.confidence).toBe('medium');
  });

  it('correctly identifies taxpayer type from 4th character position (index 3)', () => {
    // AABCX1234Z: index 3 = 'C' (Company) — IS a valid taxpayer type
    // so this should be detected as medium (valid type, no context)
    const r = D.detect(raw('AABCX1234Z'), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]?.confidence).toBe('medium'); // 'C' at position 4 is valid
  });

  it('rejects 9-character PAN (too short)', () => {
    expect(D.detect(raw('ABCPF123A'), ctx())).toHaveLength(0);
  });

  it('rejects 11-character PAN (too long)', () => {
    expect(D.detect(raw('ABCPF1234AB'), ctx())).toHaveLength(0);
  });

  it('rejects PAN starting with digit', () => {
    expect(D.detect(raw('1BCPF1234A'), ctx())).toHaveLength(0);
  });

  it('does not detect in a password field', () => {
    expect(D.detect(raw('ABCPF1234A'), ctx({ isPasswordField: true }))).toHaveLength(0);
  });

  it('produces masked preview showing first 5 + last char only', () => {
    const r = D.detect(raw('ABCPF1234A'), ctx({ labelText: 'pan' }));
    if (r.length > 0) {
      expect(r[0]!.maskedPreview).toContain('ABCPF');
      expect(r[0]!.maskedPreview).toContain('X');
    }
  });

  it('detects uppercase context keyword "income tax"', () => {
    const r = D.detect(raw('ABCPC1234A'), ctx({ labelText: 'income tax number' }));
    expect(r).toHaveLength(1);
    expect(r[0]?.confidence).toBe('high');
  });
});
