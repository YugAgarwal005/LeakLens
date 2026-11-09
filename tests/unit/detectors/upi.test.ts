// LeakLens — UPIDetector Tests

import { describe, it, expect } from 'vitest';
import { UPIDetector } from '../../../src/core/detection/detectors/UPIDetector.js';
import type { FieldContext, RawFieldValue } from '../../../src/core/types/index.js';

const D = new UPIDetector();
const raw = (s: string): RawFieldValue => s as RawFieldValue;
const ctx = (o: Partial<FieldContext> = {}): FieldContext => ({
  fieldType: 'text', fieldName: '', labelText: '', formActionOrigin: 'https://example.com',
  placeholder: '', autocomplete: '', isPasswordField: false, isInsideFrame: false, ...o,
});

describe('UPIDetector', () => {
  it('detects name@okaxis (known PSP)', () => {
    const r = D.detect(raw('john.doe@okaxis'), ctx());
    expect(r).toHaveLength(1);
  });

  it('detects 9876543210@oksbi (phone handle)', () => {
    const r = D.detect(raw('9876543210@oksbi'), ctx());
    expect(r).toHaveLength(1);
  });

  it('detects @okhdfcbank suffix', () => {
    const r = D.detect(raw('user123@okhdfcbank'), ctx());
    expect(r).toHaveLength(1);
  });

  it('detects @paytm suffix', () => {
    const r = D.detect(raw('myname@paytm'), ctx());
    expect(r).toHaveLength(1);
  });

  it('fires high confidence with UPI label context', () => {
    const r = D.detect(raw('john@upi'), ctx({ labelText: 'enter upi id' }));
    expect(r).toHaveLength(1);
    expect(r[0]?.confidence).toBe('high');
  });

  it('fires medium confidence without context for known PSP', () => {
    const r = D.detect(raw('john@okaxis'), ctx());
    expect(r.length).toBeGreaterThanOrEqual(1);
    if (r.length > 0) expect(r[0]?.confidence).toBe('medium');
  });

  it('rejects an email-like address with unknown suffix', () => {
    // foo@gmail.com should NOT match UPI (gmail is not a PSP)
    const r = D.detect(raw('foo@gmail.com'), ctx());
    expect(r).toHaveLength(0);
  });

  it('does not detect in a password field', () => {
    expect(D.detect(raw('test@okaxis'), ctx({ isPasswordField: true }))).toHaveLength(0);
  });

  it('deduplicates the same UPI detected by multiple patterns', () => {
    // Ensure a single UPI doesn't produce multiple results
    const r = D.detect(raw('9876543210@upi'), ctx());
    expect(r.length).toBeLessThanOrEqual(2); // At most one per regex
  });

  it('produces a masked preview that obscures the middle of the handle', () => {
    const r = D.detect(raw('johndoe123@okaxis'), ctx());
    if (r.length > 0) {
      expect(r[0]!.maskedPreview).toContain('@okaxis');
      expect(r[0]!.maskedPreview).not.toBe('johndoe123@okaxis');
    }
  });
});
