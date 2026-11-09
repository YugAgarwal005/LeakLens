// LeakLens — Verhoeff Algorithm Unit Tests
// Tests the Verhoeff checksum used for Aadhaar number validation.
// ALL test data is synthetic — no real Aadhaar numbers used.

import { describe, it, expect } from 'vitest';
import { verhoeffValidate, verhoeffGenerate } from '../../../src/core/detection/algorithms/verhoeff.js';

// ---------------------------------------------------------------------------
// Wikipedia reference cases
// ---------------------------------------------------------------------------

describe('verhoeffValidate — Wikipedia reference cases', () => {
  it('validates the Wikipedia example (236)', () => {
    // The Wikipedia example: check digit for 236 is 3 → 2363 is valid
    expect(verhoeffValidate('2363')).toBe(true);
  });

  it('rejects a flipped digit in the Wikipedia example', () => {
    expect(verhoeffValidate('2364')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Synthetic valid Aadhaar-length numbers (12 digits)
// These are synthetically generated to have correct Verhoeff checksums.
// The last digit is the check digit produced by verhoeffGenerate.
// ---------------------------------------------------------------------------

describe('verhoeffValidate — synthetic valid 12-digit numbers', () => {
  const validNumbers: string[] = [];

  // We generate check digits for known prefixes
  const prefixes = [
    '23456789012',
    '98765432101',
    '11223344556',
    '55443322110',
    '12345678901',
    '10987654321',
    '34567890123',
    '43210987654',
    '66778899001',
    '99887766554',
  ];

  for (const prefix of prefixes) {
    const checkDigit = verhoeffGenerate(prefix);
    if (checkDigit >= 0) {
      validNumbers.push(prefix + checkDigit.toString());
    }
  }

  it('generates at least 8 valid test numbers', () => {
    expect(validNumbers.length).toBeGreaterThanOrEqual(8);
  });

  for (const num of validNumbers) {
    it(`validates synthetic number ending in ...${num.slice(-4)}`, () => {
      expect(verhoeffValidate(num)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Invalid checksum cases
// ---------------------------------------------------------------------------

describe('verhoeffValidate — invalid checksum cases', () => {
  const prefixes = [
    '23456789012',
    '98765432101',
    '12345678901',
  ];

  for (const prefix of prefixes) {
    const checkDigit = verhoeffGenerate(prefix);
    // Test all wrong check digits
    for (let wrong = 0; wrong <= 9; wrong++) {
      if (wrong === checkDigit) continue; // skip the correct one
      it(`rejects ...${prefix.slice(-4)} with wrong check digit ${wrong}`, () => {
        expect(verhoeffValidate(prefix + wrong.toString())).toBe(false);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('verhoeffValidate — edge cases', () => {
  it('rejects empty string', () => {
    expect(verhoeffValidate('')).toBe(false);
  });

  it('rejects string with non-digit characters', () => {
    expect(verhoeffValidate('1234 5678 9012')).toBe(false);
  });

  it('rejects string with letters', () => {
    expect(verhoeffValidate('123456789AB2')).toBe(false);
  });

  it('rejects a single digit', () => {
    expect(verhoeffValidate('5')).toBe(false);
  });

  it('handles a 2-digit valid case (0 checksum)', () => {
    // 0 with check digit should work or not — just ensure no crash
    const result = verhoeffValidate('00');
    expect(typeof result).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// verhoeffGenerate
// ---------------------------------------------------------------------------

describe('verhoeffGenerate', () => {
  it('generates a digit such that appending it produces a valid checksum', () => {
    const prefix = '23456789012';
    const checkDigit = verhoeffGenerate(prefix);
    expect(checkDigit).toBeGreaterThanOrEqual(0);
    expect(checkDigit).toBeLessThanOrEqual(9);
    expect(verhoeffValidate(prefix + checkDigit.toString())).toBe(true);
  });

  it('returns -1 for non-digit input', () => {
    expect(verhoeffGenerate('abc')).toBe(-1);
  });

  it('is consistent — calling twice returns same digit', () => {
    const prefix = '55443322110';
    expect(verhoeffGenerate(prefix)).toBe(verhoeffGenerate(prefix));
  });
});
