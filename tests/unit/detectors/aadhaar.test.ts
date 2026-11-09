// LeakLens — AadhaarDetector Unit Tests
// Uses synthetic data only. Verhoeff check digits generated programmatically.

import { describe, it, expect } from 'vitest';
import { AadhaarDetector } from '../../../src/core/detection/detectors/AadhaarDetector.js';
import { verhoeffGenerate } from '../../../src/core/detection/algorithms/verhoeff.js';
import type { FieldContext, RawFieldValue } from '../../../src/core/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRaw(s: string): RawFieldValue {
  return s as RawFieldValue;
}

function buildCtx(overrides: Partial<FieldContext> = {}): FieldContext {
  return {
    fieldType: 'text',
    fieldName: '',
    labelText: '',
    formActionOrigin: 'https://example.com',
    placeholder: '',
    autocomplete: '',
    isPasswordField: false,
    isInsideFrame: false,
    ...overrides,
  };
}

/** Generate a valid 12-digit Aadhaar-format number starting with digit 2–9 */
function validAadhaar(prefix11: string): string {
  const check = verhoeffGenerate(prefix11);
  return prefix11 + check.toString();
}

const DETECTOR = new AadhaarDetector();
const V1 = validAadhaar('23456789012');  // starts with 2
const V2 = validAadhaar('56789012345');  // starts with 5

// ---------------------------------------------------------------------------
// Basic detection
// ---------------------------------------------------------------------------

describe('AadhaarDetector — basic detection', () => {
  it('detects a valid Aadhaar with Aadhaar label context (high confidence)', () => {
    const results = DETECTOR.detect(makeRaw(V1), buildCtx({ labelText: 'Enter Aadhaar number' }));
    expect(results).toHaveLength(1);
    expect(results[0]?.confidence).toBe('high');
    expect(results[0]?.category).toBe('IDENTITY_GOV_IN');
  });

  it('detects a valid Aadhaar with no context (medium confidence)', () => {
    const results = DETECTOR.detect(makeRaw(V1), buildCtx());
    expect(results).toHaveLength(1);
    expect(results[0]?.confidence).toBe('medium');
  });

  it('detects a valid Aadhaar with space separators (4 4 4 format)', () => {
    const spaced = `${V2.slice(0, 4)} ${V2.slice(4, 8)} ${V2.slice(8)}`;
    const results = DETECTOR.detect(makeRaw(spaced), buildCtx());
    expect(results).toHaveLength(1);
  });

  it('detects a valid Aadhaar with hyphen separators', () => {
    const hyphenated = `${V1.slice(0, 4)}-${V1.slice(4, 8)}-${V1.slice(8)}`;
    const results = DETECTOR.detect(makeRaw(hyphenated), buildCtx());
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Rejection cases
// ---------------------------------------------------------------------------

describe('AadhaarDetector — rejection cases', () => {
  it('rejects a 12-digit number with an invalid Verhoeff checksum and no context', () => {
    // Corrupt last digit
    const corrupted = V1.slice(0, 11) + ((parseInt(V1[11]!) + 1) % 10).toString();
    const results = DETECTOR.detect(makeRaw(corrupted), buildCtx());
    expect(results).toHaveLength(0);
  });

  it('rejects a number starting with 0', () => {
    const zeroStart = '0' + V1.slice(1);
    const results = DETECTOR.detect(makeRaw(zeroStart), buildCtx());
    expect(results).toHaveLength(0);
  });

  it('rejects a number starting with 1', () => {
    const oneStart = '1' + V1.slice(1);
    const results = DETECTOR.detect(makeRaw(oneStart), buildCtx());
    expect(results).toHaveLength(0);
  });

  it('rejects an 11-digit number (too short)', () => {
    const results = DETECTOR.detect(makeRaw('12345678901'), buildCtx());
    expect(results).toHaveLength(0);
  });

  it('rejects a 13-digit number (too long)', () => {
    const results = DETECTOR.detect(makeRaw('1234567890123'), buildCtx());
    expect(results).toHaveLength(0);
  });

  it('returns no results for empty string', () => {
    expect(DETECTOR.detect(makeRaw(''), buildCtx())).toHaveLength(0);
  });

  it('does not detect in a password field', () => {
    const results = DETECTOR.detect(makeRaw(V1), buildCtx({ isPasswordField: true }));
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Masked preview
// ---------------------------------------------------------------------------

describe('AadhaarDetector — masked preview', () => {
  it('produces a masked preview that does not contain the full raw value', () => {
    const results = DETECTOR.detect(makeRaw(V1), buildCtx({ labelText: 'aadhaar' }));
    expect(results).toHaveLength(1);
    const preview = results[0]?.maskedPreview ?? '';
    // Preview must not be the full 12 digits unmasked
    expect(preview).not.toBe(V1);
    // Preview should contain X masking characters
    expect(preview).toMatch(/X/);
  });
});

// ---------------------------------------------------------------------------
// Context signals
// ---------------------------------------------------------------------------

describe('AadhaarDetector — context signals', () => {
  const signalCases = [
    { label: 'aadhaar', ctx: { labelText: 'aadhaar' } },
    { label: 'uid', ctx: { fieldName: 'uid' } },
    { label: 'uidai', ctx: { placeholder: 'enter uidai number' } },
    { label: 'kyc', ctx: { fieldName: 'kyc_id' } },
  ];

  for (const { label, ctx } of signalCases) {
    it(`detects "${label}" context as a confidence signal`, () => {
      const results = DETECTOR.detect(makeRaw(V1), buildCtx(ctx));
      expect(results).toHaveLength(1);
      expect(results[0]?.contextSignals.length).toBeGreaterThan(0);
    });
  }
});
