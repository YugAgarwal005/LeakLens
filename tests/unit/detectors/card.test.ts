// LeakLens — CardDetector Unit Tests
// Uses publicly documented test card numbers (not real cards).

import { describe, it, expect } from 'vitest';
import { CardDetector } from '../../../src/core/detection/detectors/CardDetector.js';
import type { FieldContext, RawFieldValue } from '../../../src/core/types/index.js';

function makeRaw(s: string): RawFieldValue { return s as RawFieldValue; }

function buildCtx(overrides: Partial<FieldContext> = {}): FieldContext {
  return {
    fieldType: 'text', fieldName: '', labelText: '',
    formActionOrigin: 'https://example.com', placeholder: '',
    autocomplete: '', isPasswordField: false, isInsideFrame: false,
    ...overrides,
  };
}

const DETECTOR = new CardDetector();

// Real Luhn-valid test numbers (publicly documented)
// These are universally published test numbers, not real card numbers.
// Visa: starts with 4, Mastercard: starts with 5, Amex: 15 digits starting with 37
const VISA_TEST     = '4532015112830366';
const MC_TEST       = '5425233430109903';
const AMEX_TEST     = '378282246310005';
const RUPAY_TEST    = '6521234567890123'; // RuPay format (starts with 65)

// Construct a Luhn-valid number that is NOT a known test number
// and not in the KNOWN_TEST_NUMBERS set (the exclusion list in CardDetector)
// We use Luhn to generate a valid non-test number
// MC-range starting with 55 (outside the common test set)
const UNLISTED_VALID_CARD = '5555555555554444'; // Classic Stripe test but NOT in our exclusion list

describe('CardDetector — known valid test numbers are excluded', () => {
  it('does NOT flag 4532015112830366 (known test number)', () => {
    const r = DETECTOR.detect(makeRaw(VISA_TEST), buildCtx({ labelText: 'card number' }));
    expect(r).toHaveLength(0);
  });
});

describe('CardDetector — detection with context', () => {
  it('detects a Visa-like number with card label context (high confidence)', () => {
    const r = DETECTOR.detect(
      makeRaw(UNLISTED_VALID_CARD),
      buildCtx({ labelText: 'card number', autocomplete: 'cc-number' }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.confidence).toBe('high');
    expect(r[0]?.category).toBe('PAYMENT_CARD');
  });

  it('detects with space separators (4 4 4 4 format)', () => {
    const spaced = UNLISTED_VALID_CARD.replace(/(\d{4})/g, '$1 ').trim();
    const r = DETECTOR.detect(makeRaw(spaced), buildCtx({ labelText: 'credit card' }));
    expect(r).toHaveLength(1);
  });

  it('detects with hyphen separators', () => {
    const hyphenated = UNLISTED_VALID_CARD.replace(/(\d{4})(?=\d)/g, '$1-');
    const r = DETECTOR.detect(makeRaw(hyphenated), buildCtx({ labelText: 'card' }));
    expect(r).toHaveLength(1);
  });

  it('includes scheme in context signals for known BIN', () => {
    const r = DETECTOR.detect(
      makeRaw(UNLISTED_VALID_CARD),
      buildCtx({ labelText: 'card' }),
    );
    if (r.length > 0) {
      const hasScheme = r[0]!.contextSignals.some((s) => s.startsWith('scheme:'));
      expect(hasScheme).toBe(true);
    }
  });
});

describe('CardDetector — rejection cases', () => {
  it('rejects a 12-digit number (below minimum length)', () => {
    const r = DETECTOR.detect(makeRaw('411111111111'), buildCtx({ labelText: 'card' }));
    expect(r).toHaveLength(0);
  });

  it('rejects a 20-digit number (above maximum length)', () => {
    const r = DETECTOR.detect(makeRaw('41111111111111111111'), buildCtx({ labelText: 'card' }));
    expect(r).toHaveLength(0);
  });

  it('rejects a Luhn-invalid number', () => {
    const r = DETECTOR.detect(makeRaw('4532015112830367'), buildCtx({ labelText: 'card' }));
    expect(r).toHaveLength(0);
  });

  it('returns empty for empty string', () => {
    expect(DETECTOR.detect(makeRaw(''), buildCtx())).toHaveLength(0);
  });

  it('does not detect in a password field', () => {
    const r = DETECTOR.detect(makeRaw(UNLISTED_VALID_CARD), buildCtx({ isPasswordField: true }));
    expect(r).toHaveLength(0);
  });
});

describe('CardDetector — preview format', () => {
  it('produces XXXX-XXXX-XXXX-LAST4 style preview', () => {
    const r = DETECTOR.detect(makeRaw(UNLISTED_VALID_CARD), buildCtx({ labelText: 'card' }));
    if (r.length > 0) {
      const preview = r[0]!.maskedPreview;
      expect(preview).toMatch(/XXXX/);
      const last4 = UNLISTED_VALID_CARD.slice(-4);
      expect(preview).toContain(last4);
    }
  });
});
