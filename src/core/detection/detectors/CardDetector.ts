// LeakLens — CardDetector
// Detects credit and debit card numbers using Luhn validation and BIN prefix matching.
//
// Key design decisions:
// - Requires ≥13 digits to avoid false positives on short numeric strings.
// - Luhn validates the candidate — all major card networks use it.
// - BIN prefix matching boosts confidence for known schemes.
// - Context signals (label/placeholder) and field type improve accuracy.
// - 19 digits is the maximum valid card length (some Maestro/UnionPay cards).

import type { Detector } from '../Detector.js';
import { maskValue } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';
import { luhnValidate } from '../algorithms/luhn.js';

/** Finds digit sequences 13–19 chars, optionally separated by spaces/hyphens */
const CARD_REGEX = /\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{1,7}|\d{13,19})\b/g;

/** Known card BIN prefix patterns */
const BIN_PATTERNS: { scheme: string; pattern: RegExp }[] = [
  { scheme: 'Visa',       pattern: /^4/ },
  { scheme: 'Mastercard', pattern: /^5[1-5]|^2[2-7]/ },
  { scheme: 'Amex',       pattern: /^3[47]/ },
  { scheme: 'Discover',   pattern: /^6(?:011|5)/ },
  { scheme: 'RuPay',      pattern: /^60|^65|^81|^82/ },
  { scheme: 'Maestro',    pattern: /^(?:5018|5020|5038|6304|6759|676[1-3])/ },
  { scheme: 'JCB',        pattern: /^35/ },
  { scheme: 'Diners',     pattern: /^3(?:0[0-5]|[68])/ },
  { scheme: 'UnionPay',   pattern: /^62/ },
];

const CONTEXT_SIGNALS = [
  'card', 'credit', 'debit', 'payment', 'cvv', 'cvc', 'expiry',
  'expiration', 'card number', 'pan', 'visa', 'mastercard', 'amex',
  'rupay', 'maestro', 'billing',
];

/** Field types where card entry is expected */
const EXPECTED_FIELD_TYPES = new Set(['tel', 'number', 'text']);

/** Well-known test card numbers — never trigger a warning in tests */
const KNOWN_TEST_NUMBERS = new Set([
  '4111111111111111',
  '4532015112830366',
  '5425233430109903',
  '378282246310005',
  '371449635398431',
]);

export class CardDetector implements Detector {
  readonly id = 'card-v1';
  readonly version = '1.0.0';
  readonly category = 'PAYMENT_CARD' as const;
  readonly regions = ['GLOBAL'] as const;
  readonly severityHint = 'high' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    if (context.isPasswordField) return [];

    const results: DetectionResult[] = [];
    const text = value as string;
    const contextText = this.buildContextText(context);

    let match: RegExpExecArray | null;
    CARD_REGEX.lastIndex = 0;

    while ((match = CARD_REGEX.exec(text)) !== null) {
      const raw = match[1];
      if (!raw) continue;

      const digits = raw.replace(/[\s\-]/g, '');

      // Minimum length guard — Luhn passes on short all-zero strings
      if (digits.length < 13 || digits.length > 19) continue;

      // Skip known test numbers to avoid false positives in dev environments
      if (KNOWN_TEST_NUMBERS.has(digits)) continue;

      // Luhn validation
      if (!luhnValidate(digits)) continue;

      // BIN prefix matching
      const matchedScheme = this.matchBin(digits);
      const contextSignals = this.scoreContext(contextText);
      const hasExpectedFieldType = EXPECTED_FIELD_TYPES.has(context.fieldType);

      let confidence: DetectionResult['confidence'];
      if (matchedScheme && (contextSignals.length > 0 || hasExpectedFieldType)) {
        confidence = 'high';
      } else if (matchedScheme || contextSignals.length > 0) {
        confidence = 'medium';
      } else {
        // Luhn-valid but no BIN match and no context — could be IMEI or other
        confidence = 'low';
      }

      results.push({
        detectorId: this.id,
        category: this.category,
        confidence,
        maskedPreview: this.buildPreview(digits, matchedScheme),
        matchCount: 1,
        contextSignals: matchedScheme
          ? [...contextSignals, `scheme:${matchedScheme}`]
          : contextSignals,
      });
    }

    return results;
  }

  private matchBin(digits: string): string | null {
    for (const { scheme, pattern } of BIN_PATTERNS) {
      if (pattern.test(digits)) return scheme;
    }
    return null;
  }

  private buildContextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete]
      .join(' ')
      .toLowerCase();
  }

  private scoreContext(text: string): string[] {
    return CONTEXT_SIGNALS.filter((s) => text.includes(s));
  }

  private buildPreview(digits: string, scheme: string | null): string {
    // Show last 4 digits like a real card display
    const last4 = digits.slice(-4);
    const prefix = scheme ? `${scheme} ` : '';
    return `${prefix}XXXX-XXXX-XXXX-${last4}`;
  }
}
